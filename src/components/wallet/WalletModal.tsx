"use client";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Alert } from "@/components/ui/Alert";
import { useWallet } from "@/hooks/useWallet";
import { truncateMiddle } from "@/lib/format";

export interface WalletModalProps {
  open: boolean;
  onClose: () => void;
}

export function WalletModal({ open, onClose }: WalletModalProps) {
  const { availableWallets, connect, status, error, clearError } = useWallet();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Connect a Stellar wallet"
      description="Your keys stay in your wallet. HeirVault never sees or stores them."
    >
      <ul className="space-y-2">
        {availableWallets.map(({ adapter, available }) => (
          <li
            key={adapter.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-content-strong">{adapter.name}</p>
              <p className="text-xs text-muted">
                {available ? "Detected in this browser" : "Not installed"}
              </p>
            </div>
            {available ? (
              <Button
                size="sm"
                onClick={async () => {
                  await connect(adapter.id);
                  onClose();
                }}
              >
                Connect
              </Button>
            ) : (
              <a
                className="hv-link text-xs"
                href={adapter.installUrl}
                target="_blank"
                rel="noreferrer"
              >
                Install {truncateMiddle(adapter.name, 12)}
              </a>
            )}
          </li>
        ))}
      </ul>

      {status === "unavailable" && (
        <Alert tone="warning" className="mt-4">
          No supported Stellar wallet was detected. Install a wallet extension and reload the page.
        </Alert>
      )}

      {error && (
        <Alert
          tone="danger"
          className="mt-4"
          title="Could not connect"
          action={
            <Button variant="ghost" size="sm" onClick={clearError}>
              Dismiss
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <p className="mt-4 text-xs text-muted">
        Only public addresses are requested. HeirVault never asks for a secret key or seed phrase.
      </p>
    </Dialog>
  );
}
