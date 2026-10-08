"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TxStatus } from "@/components/ui/TxStatus";
import { useWallet } from "@/hooks/useWallet";
import { useVault } from "@/hooks/useVault";
import { IDLE_TRANSACTION, type TransactionState } from "@/lib/stellar/transactions";
import type { VaultState } from "@/lib/vault/calculations";
import type { Vault } from "@/lib/vault/types";

export interface VaultActionsPanelProps {
  vault: Vault;
  state: VaultState;
}

type PendingAction = "cancel" | "trigger" | "approve" | null;

/**
 * Owner and guardian management actions.
 *
 * Every action goes through the same honest pipeline: it is only reported as
 * successful after Soroban RPC confirms it. When the contract id is missing the
 * buttons explain why instead of pretending.
 */
export function VaultActionsPanel({ vault, state }: VaultActionsPanelProps) {
  const { address } = useWallet();
  const { contractConfigured, cancelVault, triggerActivation, approveActivation } = useVault();
  const [pending, setPending] = useState<PendingAction>(null);
  const [tx, setTx] = useState<TransactionState>(IDLE_TRANSACTION);

  const isOwner = !!address && address === vault.owner;
  const isGuardian = !!address && vault.guardians.some((guardian) => guardian.address === address);
  const hasApproved = !!address && vault.activationApprovals.includes(address);
  const terminal = vault.status === "cancelled" || vault.status === "completed";

  async function run(action: Exclude<PendingAction, null>) {
    setPending(null);
    const result =
      action === "cancel"
        ? await cancelVault(vault.id)
        : action === "trigger"
          ? await triggerActivation(vault.id)
          : await approveActivation(vault.id);
    setTx(result);
  }

  return (
    <Card>
      <CardHeader
        title="Vault management"
        description="Owner and guardian controls. All actions require a wallet signature."
      />
      <CardBody className="space-y-4">
        {!contractConfigured && (
          <Alert tone="neutral">
            These actions are disabled because no HeirVault contract is configured. The UI is wired to the
            contract entrypoints and will work once one is deployed.
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            disabled={!contractConfigured || !isOwner || terminal}
            onClick={() => setPending("cancel")}
          >
            Cancel vault
          </Button>

          <Button
            variant="outline"
            disabled={!contractConfigured || terminal || state.status === "triggered"}
            onClick={() => setPending("trigger")}
            title={
              state.activationEligible
                ? "Submit the activation transaction"
                : "Activation conditions are not met yet"
            }
          >
            Trigger activation
          </Button>

          <Button
            variant="secondary"
            disabled={!contractConfigured || !isGuardian || hasApproved || terminal}
            onClick={() => setPending("approve")}
          >
            {hasApproved ? "Approval recorded" : "Approve activation"}
          </Button>
        </div>

        {!isOwner && !isGuardian && (
          <p className="text-xs text-muted">
            You are neither the owner nor a guardian of this vault, so management actions are unavailable.
          </p>
        )}

        {state.status === "triggered" && (
          <Alert tone="warning" title="Vault is triggered">
            Activation conditions are met. Beneficiaries can now claim their allocation.
          </Alert>
        )}

        <TxStatus state={tx} />
      </CardBody>

      <ConfirmDialog
        open={pending === "cancel"}
        title="Cancel this vault?"
        description="Cancelling returns the protected assets to you and permanently ends the inheritance plan."
        confirmLabel="Cancel vault"
        destructive
        warning="This cannot be undone. The contract will reject activation and claims afterwards."
        onCancel={() => setPending(null)}
        onConfirm={() => run("cancel")}
      />

      <ConfirmDialog
        open={pending === "trigger"}
        title="Trigger activation?"
        description="This asks the contract to activate the vault so beneficiaries can claim."
        confirmLabel="Trigger activation"
        onCancel={() => setPending(null)}
        onConfirm={() => run("trigger")}
      />

      <ConfirmDialog
        open={pending === "approve"}
        title="Approve activation as guardian?"
        description="Your approval is recorded on-chain and counts toward the guardian threshold."
        confirmLabel="Approve"
        onCancel={() => setPending(null)}
        onConfirm={() => run("approve")}
      />
    </Card>
  );
}
