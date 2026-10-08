"use client";

/**
 * Wallet state for the whole app.
 *
 * Responsibilities:
 *  - discover which adapters are installed;
 *  - connect / disconnect and remember the last adapter used;
 *  - expose a `sign()` function the transaction layer can call;
 *  - report a network mismatch between the wallet and the app configuration.
 *
 * It performs no transaction logic of its own — that lives in
 * `src/lib/stellar/transactions.ts`.
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getNetworkConfig } from "@/lib/stellar/network";
import {
  getWalletAdapter,
  WALLET_ADAPTERS,
  WalletRejectedError,
  type WalletAdapter,
  type WalletNetwork,
} from "@/lib/stellar/wallet";

export type WalletStatus =
  | "detecting"
  | "unavailable"
  | "disconnected"
  | "connecting"
  | "connected";

export interface AvailableWallet {
  adapter: WalletAdapter;
  available: boolean;
}

export interface WalletContextValue {
  status: WalletStatus;
  address: string | null;
  adapterId: string | null;
  availableWallets: AvailableWallet[];
  walletNetwork: WalletNetwork | null;
  /** True when the wallet reports the same passphrase as the app config. */
  networkMatches: boolean;
  expectedPassphrase: string;
  expectedNetworkLabel: string;
  error: string | null;
  connect: (adapterId?: string) => Promise<void>;
  disconnect: () => void;
  sign: (xdrEnvelope: string) => Promise<string>;
  clearError: () => void;
}

const STORAGE_KEY = "heirvault.wallet.adapter";

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const networkConfig = useMemo(() => getNetworkConfig(), []);

  const [status, setStatus] = useState<WalletStatus>("detecting");
  const [address, setAddress] = useState<string | null>(null);
  const [adapterId, setAdapterId] = useState<string | null>(null);
  const [walletNetwork, setWalletNetwork] = useState<WalletNetwork | null>(null);
  const [availableWallets, setAvailableWallets] = useState<AvailableWallet[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Detect installed wallets and restore a previously authorised session.
  useEffect(() => {
    let cancelled = false;

    async function detect() {
      const results = await Promise.all(
        WALLET_ADAPTERS.map(async (adapter) => ({ adapter, available: await adapter.isAvailable() })),
      );
      if (cancelled) return;

      setAvailableWallets(results);
      const anyAvailable = results.some((entry) => entry.available);

      if (!anyAvailable) {
        setStatus("unavailable");
        return;
      }

      const remembered =
        typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      const candidate = remembered ? getWalletAdapter(remembered) : undefined;

      if (candidate && (await candidate.isAvailable())) {
        const existing = await candidate.getAuthorisedAddress();
        if (cancelled) return;
        if (existing) {
          setAddress(existing);
          setAdapterId(candidate.id);
          setWalletNetwork(await candidate.getNetwork());
          setStatus("connected");
          return;
        }
      }

      setStatus("disconnected");
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(
    async (requestedId?: string) => {
      setError(null);
      const adapter =
        (requestedId ? getWalletAdapter(requestedId) : undefined) ??
        availableWallets.find((entry) => entry.available)?.adapter;

      if (!adapter) {
        setStatus("unavailable");
        setError("No supported Stellar wallet was detected in this browser.");
        return;
      }

      setStatus("connecting");
      try {
        const connectedAddress = await adapter.connect();
        setAddress(connectedAddress);
        setAdapterId(adapter.id);
        setWalletNetwork(await adapter.getNetwork());
        setStatus("connected");
        try {
          window.localStorage.setItem(STORAGE_KEY, adapter.id);
        } catch {
          // Non-fatal: the session simply won't be remembered.
        }
      } catch (connectError) {
        setStatus("disconnected");
        setError(
          connectError instanceof WalletRejectedError
            ? connectError.message
            : connectError instanceof Error
              ? connectError.message
              : "Could not connect to the wallet.",
        );
      }
    },
    [availableWallets],
  );

  const disconnect = useCallback(() => {
    setAddress(null);
    setAdapterId(null);
    setWalletNetwork(null);
    setError(null);
    setStatus("disconnected");
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const sign = useCallback(
    async (xdrEnvelope: string) => {
      const adapter = adapterId ? getWalletAdapter(adapterId) : undefined;
      if (!adapter || !address) {
        throw new WalletRejectedError("Connect a wallet before signing transactions.");
      }
      return adapter.signTransaction(xdrEnvelope, address, networkConfig.passphrase);
    },
    [adapterId, address, networkConfig.passphrase],
  );

  const networkMatches = walletNetwork
    ? walletNetwork.networkPassphrase === networkConfig.passphrase
    : true;

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      address,
      adapterId,
      availableWallets,
      walletNetwork,
      networkMatches,
      expectedPassphrase: networkConfig.passphrase,
      expectedNetworkLabel: networkConfig.label,
      error,
      connect,
      disconnect,
      sign,
      clearError: () => setError(null),
    }),
    [
      status,
      address,
      adapterId,
      availableWallets,
      walletNetwork,
      networkMatches,
      networkConfig.label,
      networkConfig.passphrase,
      error,
      connect,
      disconnect,
      sign,
    ],
  );

  // `createElement` keeps this file free of JSX so it can remain a `.ts` module.
  return createElement(WalletContext.Provider, { value }, children);
}

/** Access wallet state. Must be used inside a {@link WalletProvider}. */
export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a <WalletProvider>.");
  }
  return context;
}

/** True when the wallet is connected and pointed at the app's network. */
export function useWalletReady(): boolean {
  const { status, networkMatches } = useWallet();
  return status === "connected" && networkMatches;
}
