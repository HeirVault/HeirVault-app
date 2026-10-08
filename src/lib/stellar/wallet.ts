/**
 * Wallet adapter layer.
 *
 * The rest of the app never imports a wallet provider directly — it talks to a
 * {@link WalletAdapter}. Adding support for another Stellar wallet (xBull,
 * Lobstr, Albedo, …) means adding one object to {@link WALLET_ADAPTERS} and
 * nothing else.
 *
 * Adapters are loaded lazily via dynamic `import()` so that wallet bundles are
 * never evaluated during server rendering.
 */

export interface WalletNetwork {
  network: string;
  networkPassphrase: string;
}

export interface WalletAdapter {
  id: string;
  name: string;
  /** Where the user can install the wallet if it is missing. */
  installUrl: string;
  /** Whether the extension/provider is available in this browser. */
  isAvailable(): Promise<boolean>;
  /** Address already authorised for this origin, if any. */
  getAuthorisedAddress(): Promise<string | null>;
  /** Prompt the user to connect and return the granted address. */
  connect(): Promise<string>;
  /**
   * Sign a transaction envelope. Returns the signed XDR.
   * Must throw when the user rejects the request.
   */
  signTransaction(xdrEnvelope: string, address: string, networkPassphrase: string): Promise<string>;
  /** Network the wallet is currently pointed at. */
  getNetwork(): Promise<WalletNetwork | null>;
}

/** Raised when the user declines a wallet prompt. */
export class WalletRejectedError extends Error {
  constructor(message = "The wallet request was declined by the user.") {
    super(message);
    this.name = "WalletRejectedError";
  }
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Adapter for the Freighter browser extension. */
const freighterAdapter: WalletAdapter = {
  id: "freighter",
  name: "Freighter",
  installUrl: "https://freighter.app",

  async isAvailable() {
    if (!isBrowser()) return false;
    try {
      const { isConnected } = await import("@stellar/freighter-api");
      const result = await isConnected();
      return Boolean(result?.isConnected);
    } catch {
      return false;
    }
  },

  async getAuthorisedAddress() {
    if (!isBrowser()) return null;
    try {
      const { isAllowed, getAddress } = await import("@stellar/freighter-api");
      const allowed = await isAllowed();
      if (!allowed?.isAllowed) return null;
      const result = await getAddress();
      if (result?.error) return null;
      return result.address || null;
    } catch {
      return null;
    }
  },

  async connect() {
    if (!isBrowser()) throw new WalletRejectedError("Wallets are only available in the browser.");
    const { requestAccess } = await import("@stellar/freighter-api");
    const result = await requestAccess();
    if (result?.error) {
      throw new WalletRejectedError(result.error.message || "Freighter declined the connection request.");
    }
    if (!result.address) {
      throw new WalletRejectedError("Freighter returned no address.");
    }
    return result.address;
  },

  async signTransaction(xdrEnvelope, address, networkPassphrase) {
    if (!isBrowser()) throw new WalletRejectedError("Wallets are only available in the browser.");
    const { signTransaction } = await import("@stellar/freighter-api");
    const result = await signTransaction(xdrEnvelope, { address, networkPassphrase });
    if (result?.error) {
      throw new WalletRejectedError(result.error.message || "Freighter declined the signature request.");
    }
    if (!result.signedTxXdr) {
      throw new WalletRejectedError("Freighter returned no signed transaction.");
    }
    return result.signedTxXdr;
  },

  async getNetwork() {
    if (!isBrowser()) return null;
    try {
      const { getNetwork } = await import("@stellar/freighter-api");
      const result = await getNetwork();
      if (result?.error) return null;
      return { network: result.network, networkPassphrase: result.networkPassphrase };
    } catch {
      return null;
    }
  },
};

export const WALLET_ADAPTERS: WalletAdapter[] = [freighterAdapter];

export function getWalletAdapter(id: string): WalletAdapter | undefined {
  return WALLET_ADAPTERS.find((adapter) => adapter.id === id);
}

/** Shorten a Stellar address for display: `GABC…WXYZ`. */
export function shortenAddress(address: string, visible = 4): string {
  if (!address) return "";
  if (address.length <= visible * 2 + 1) return address;
  return `${address.slice(0, visible)}…${address.slice(-visible)}`;
}

/**
 * Basic client-side sanity check for a Stellar ed25519 public key.
 * Full validation is performed by the network; this only guards the UI.
 */
export function looksLikeStellarAddress(value: string): boolean {
  const trimmed = value.trim().toUpperCase();
  return /^G[A-Z2-7]{55}$/.test(trimmed);
}

/** Contract ids start with `C` and use the same base32 alphabet. */
export function looksLikeContractId(value: string): boolean {
  const trimmed = value.trim().toUpperCase();
  return /^C[A-Z2-7]{55}$/.test(trimmed);
}
