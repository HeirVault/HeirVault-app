"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useWallet } from "@/hooks/useWallet";
import { getNetworkConfig } from "@/lib/stellar/network";
import { truncateMiddle } from "@/lib/format";
import { cn } from "@/lib/cn";

import { NetworkBadge } from "./NetworkBadge";

export function WalletIndicator({ className }: { className?: string }) {
  const { address, adapterId, disconnect, networkMatches, walletNetwork, expectedNetworkLabel } = useWallet();
  const [open, setOpen] = useState(false);
  const network = getNetworkConfig();

  if (!address) return null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {!networkMatches && (
        <Badge tone="danger" dot title="The wallet is pointed at a different network">
          Wrong network
        </Badge>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-content-strong transition hover:border-brand-300"
        aria-haspopup="dialog"
      >
        <span aria-hidden className="h-2 w-2 rounded-full bg-success-500" />
        <span className="font-mono">{truncateMiddle(address, 4)}</span>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Wallet"
        description="Your connected Stellar account."
        footer={
          <Button
            variant="outline"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
          >
            Disconnect
          </Button>
        }
      >
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Address</dt>
            <dd className="mt-1 break-all font-mono text-xs text-content-strong">{address}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Wallet</dt>
            <dd className="mt-1 capitalize text-content-strong">{adapterId ?? "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Wallet network</dt>
            <dd className="mt-1 text-content-strong">
              {walletNetwork?.network ?? "Unknown"}{" "}
              <span className="text-xs text-muted">(passphrase: {walletNetwork?.networkPassphrase ?? "—"})</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">App network</dt>
            <dd className="mt-1">
              <NetworkBadge />
            </dd>
          </div>
        </dl>

        {!networkMatches && (
          <p className="mt-4 rounded-lg border border-danger-500/30 bg-danger-100/60 p-3 text-xs text-danger-700">
            Your wallet is on a different network than the app. Switch it to {expectedNetworkLabel} before
            signing — otherwise the network will reject the signature.
          </p>
        )}

        <p className="mt-4 text-xs text-muted">
          HeirVault is configured for {network.label}. Transactions are signed in your wallet and submitted
          directly to Soroban RPC.
        </p>
      </Dialog>
    </div>
  );
}
