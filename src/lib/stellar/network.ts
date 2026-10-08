/**
 * Stellar network configuration.
 *
 * Everything in this module is derived from `NEXT_PUBLIC_*` environment
 * variables — nothing is hard-coded to a specific deployment. The only
 * constants are the canonical network passphrases published by the Stellar
 * network operators, which are public information required by the protocol
 * (not secrets).
 *
 * NOTE: `process.env.X` must be referenced statically so that Next.js can
 * inline the values into client bundles. Do not replace these with dynamic
 * lookups such as `process.env[key]`.
 */

export const NETWORK_IDS = ["testnet", "mainnet", "futurenet", "standalone"] as const;

export type StellarNetworkId = (typeof NETWORK_IDS)[number];

export interface StellarNetworkConfig {
  /** Machine-readable network identifier. */
  id: StellarNetworkId;
  /** Human-readable label for the UI. */
  label: string;
  /** Soroban RPC endpoint. */
  rpcUrl: string;
  /** Horizon endpoint (account/balance reads, explorer helpers). */
  horizonUrl: string;
  /** Network passphrase used when building/signing transactions. */
  passphrase: string;
  /** Base URL of the block explorer for this network. */
  explorerBaseUrl: string;
  /** True when the network is Stellar Mainnet (real funds). */
  isMainnet: boolean;
}

/** Canonical Stellar network passphrases. Public protocol constants. */
const NETWORK_PASSPHRASES: Record<StellarNetworkId, string> = {
  testnet: "Test SDF Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015",
  futurenet: "Test SDF Future Network ; October 2022",
  standalone: "Standalone Network ; February 2017",
};

const DEFAULT_RPC_URLS: Record<StellarNetworkId, string> = {
  testnet: "https://soroban-testnet.stellar.org",
  mainnet: "https://mainnet.sorobanrpc.com",
  futurenet: "https://rpc-futurenet.stellar.org",
  standalone: "http://localhost:8000/soroban/rpc",
};

const DEFAULT_HORIZON_URLS: Record<StellarNetworkId, string> = {
  testnet: "https://horizon-testnet.stellar.org",
  mainnet: "https://horizon.stellar.org",
  futurenet: "https://horizon-futurenet.stellar.org",
  standalone: "http://localhost:8000",
};

const DEFAULT_EXPLORER_BASE_URLS: Record<StellarNetworkId, string> = {
  testnet: "https://stellar.expert/explorer/testnet",
  mainnet: "https://stellar.expert/explorer/public",
  futurenet: "https://stellar.expert/explorer/futurenet",
  standalone: "",
};

const NETWORK_LABELS: Record<StellarNetworkId, string> = {
  testnet: "Stellar Testnet",
  mainnet: "Stellar Mainnet",
  futurenet: "Stellar Futurenet",
  standalone: "Local / Standalone",
};

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normaliseNetworkId(raw: string | undefined): StellarNetworkId {
  const value = raw?.trim().toLowerCase();
  if (value && (NETWORK_IDS as readonly string[]).includes(value)) {
    return value as StellarNetworkId;
  }
  return "testnet";
}

/** The network the app is configured to talk to. Defaults to Testnet. */
export const ACTIVE_NETWORK_ID: StellarNetworkId = normaliseNetworkId(
  process.env.NEXT_PUBLIC_STELLAR_NETWORK,
);

const ENV_RPC_URL = emptyToUndefined(process.env.NEXT_PUBLIC_STELLAR_RPC_URL);
const ENV_HORIZON_URL = emptyToUndefined(process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL);
const ENV_PASSPHRASE = emptyToUndefined(process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE);
const ENV_EXPLORER_BASE = emptyToUndefined(process.env.NEXT_PUBLIC_EXPLORER_BASE_URL);

/**
 * Resolve the effective network configuration.
 *
 * @param override Optional network id to resolve instead of the configured one.
 *                 Used by the UI when the connected wallet reports a different
 *                 network than the app is configured for.
 */
export function getNetworkConfig(
  override?: StellarNetworkId,
): StellarNetworkConfig {
  const id = override ?? ACTIVE_NETWORK_ID;
  return {
    id,
    label: NETWORK_LABELS[id],
    rpcUrl: (id === ACTIVE_NETWORK_ID && ENV_RPC_URL) || DEFAULT_RPC_URLS[id],
    horizonUrl: (id === ACTIVE_NETWORK_ID && ENV_HORIZON_URL) || DEFAULT_HORIZON_URLS[id],
    passphrase:
      (id === ACTIVE_NETWORK_ID && ENV_PASSPHRASE) || NETWORK_PASSPHRASES[id],
    explorerBaseUrl: (id === ACTIVE_NETWORK_ID && ENV_EXPLORER_BASE) || DEFAULT_EXPLORER_BASE_URLS[id],
    isMainnet: id === "mainnet",
  };
}

export function getNetworkPassphrase(override?: StellarNetworkId): string {
  return getNetworkConfig(override).passphrase;
}

export function isNetworkId(value: string): value is StellarNetworkId {
  return (NETWORK_IDS as readonly string[]).includes(value);
}

export function networkLabel(id: StellarNetworkId): string {
  return NETWORK_LABELS[id];
}
