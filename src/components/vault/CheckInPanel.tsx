"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { TxStatus } from "@/components/ui/TxStatus";
import { useCountdown, formatCountdown } from "@/hooks/useCountdown";
import { useWallet } from "@/hooks/useWallet";
import { useVault } from "@/hooks/useVault";
import { formatDateTime } from "@/lib/format";
import { IDLE_TRANSACTION, type TransactionState } from "@/lib/stellar/transactions";
import type { VaultState } from "@/lib/vault/calculations";
import type { Vault } from "@/lib/vault/types";

export interface CheckInPanelProps {
  vault: Vault;
  state: VaultState;
}

/** Liveness check-in — the heartbeat that keeps a vault from activating. */
export function CheckInPanel({ vault, state }: CheckInPanelProps) {
  const wallet = useWallet();
  const { checkIn } = useVault();
  const [tx, setTx] = useState<TransactionState>(IDLE_TRANSACTION);
  const [confirming, setConfirming] = useState(false);

  const countdown = useCountdown(state.nextCheckInDueAt);
  const isOwner = !!wallet.address && wallet.address === vault.owner;
  const terminal = vault.status === "cancelled" || vault.status === "completed";
  const activated = state.status === "triggered";

  async function submit() {
    setConfirming(false);
    const result = await checkIn(vault.id);
    setTx(result);
  }

  return (
    <Card>
      <CardHeader
        title="Check-in"
        description="Prove you are still in control. Miss it and the grace period starts."
      />
      <CardBody className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Last check-in</dt>
            <dd className="mt-1 font-medium text-content-strong">
              {formatDateTime(vault.lastCheckInAt ?? vault.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Next deadline</dt>
            <dd className="mt-1 font-medium text-content-strong">
              {formatDateTime(state.nextCheckInDueAt)}
            </dd>
          </div>
        </dl>

        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Time remaining</p>
          <p className="mt-1 text-xl font-semibold text-content-strong" aria-live="polite">
            {formatCountdown(countdown)}
          </p>
          {state.checkInOverdue && (
            <p className="mt-1 text-xs font-medium text-warning-700">
              Grace period ends {formatDateTime(state.graceDeadlineAt)}
            </p>
          )}
        </div>

        {!isOwner && (
          <Alert tone="neutral">
            Only the vault owner ({vault.owner.slice(0, 8)}…) can submit a check-in.
          </Alert>
        )}

        {activated && (
          <Alert tone="warning" title="Vault already activated">
            Check-in is no longer accepted once the vault has been activated.
          </Alert>
        )}

        {terminal && (
          <Alert tone="neutral">This vault is {vault.status} and no longer accepts check-ins.</Alert>
        )}

        {confirming ? (
          <Alert
            tone="warning"
            title="Confirm check-in"
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={submit}>
                  Sign check-in
                </Button>
              </div>
            }
          >
            This submits a signed transaction to the HeirVault contract. Your wallet will ask you to approve it.
          </Alert>
        ) : (
          <Button
            onClick={() => setConfirming(true)}
            disabled={!isOwner || terminal || activated}
            fullWidth
          >
            Check in now
          </Button>
        )}

        <TxStatus state={tx} />
      </CardBody>
    </Card>
  );
}
