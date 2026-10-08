"use client";

import type { ReactNode } from "react";

import { Alert } from "@/components/ui/Alert";
import { useWallet } from "@/hooks/useWallet";

import { ConnectWalletButton } from "./ConnectWalletButton";

export interface WalletGateProps {
  children: ReactNode;
  /** Message shown when no wallet is connected. */
  description?: ReactNode;
}

/**
 * Renders `children` only when a wallet is connected and on the right network.
 * Otherwise it explains exactly what is missing — no silent placeholders.
 */
export function WalletGate({ children, description }: WalletGateProps) {
  const { status, networkMatches, expectedNetworkLabel } = useWallet();

  if (status === "connected" && networkMatches) {
    return <>{children}</>;
  }

  if (status === "connected" && !networkMatches) {
    return (
      <Alert tone="danger" title="Wrong network">
        Switch your wallet to {expectedNetworkLabel} to continue. The app will not submit transactions to the
        wrong network.
      </Alert>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center">
      <h2 className="text-base font-semibold text-content-strong">Connect a wallet to continue</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        {description ?? "This page reads and writes vault state for your account."}
      </p>
      <div className="mt-5 flex justify-center">
        <ConnectWalletButton />
      </div>
    </div>
  );
}
