"use client";

import Link from "next/link";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { TxStatus } from "@/components/ui/TxStatus";
import type { TransactionState } from "@/lib/stellar/transactions";
import { formatAssetAmount } from "@/lib/format";
import type { VaultDraft } from "@/lib/vault/types";

export interface StepConfirmProps {
  draft: VaultDraft;
  /** Local vault record id created from this draft. */
  vaultId: string | null;
  contractConfigured: boolean;
  networkLabel: string;
  transaction: TransactionState;
  deployDisabledReason?: string;
  onDeploy: () => void;
}

/**
 * Final step: the wallet transaction confirmation.
 *
 * Nothing here claims success. The button asks the wallet to sign, the node
 * simulates and submits, and the UI only reports "confirmed" when RPC says so.
 */
export function StepConfirm({
  draft,
  vaultId,
  contractConfigured,
  networkLabel,
  transaction,
  deployDisabledReason,
  onDeploy,
}: StepConfirmProps) {
  const deployed = transaction.phase === "success";

  return (
    <div className="space-y-5">
      {!contractConfigured ? (
        <Alert tone="neutral" title="Deployment is not available in this environment">
          No HeirVault contract id is configured. Your vault configuration has been saved locally as a draft,
          and it will be deployable as soon as <code className="font-mono">NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID</code>{" "}
          points at a deployed contract.
        </Alert>
      ) : (
        <Alert tone="info" title={`Ready to submit on ${networkLabel}`}>
          Signing this transaction creates the vault on-chain and transfers the initial deposit in the same
          call.
        </Alert>
      )}

      <Card>
        <CardHeader title="Transaction summary" description="What the contract call will contain." />
        <CardBody>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Vault</dt>
              <dd className="text-content-strong">{draft.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Initial deposit</dt>
              <dd className="text-content-strong">
                {formatAssetAmount(draft.asset.amount || "0", draft.asset.symbol, draft.asset.decimals)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Beneficiaries</dt>
              <dd className="text-content-strong">{draft.beneficiaries.length}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Guardians</dt>
              <dd className="text-content-strong">{draft.guardians.length}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Activation</dt>
              <dd className="text-content-strong">{draft.activation.trigger}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <TxStatus state={transaction} />

      {deployed ? (
        <Alert
          tone="success"
          title="Vault created on-chain"
          action={
            vaultId && (
              <Link className="hv-link" href={`/vault/${vaultId}`}>
                Open vault
              </Link>
            )
          }
        >
          The network confirmed the transaction. Your vault is now active.
        </Alert>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={onDeploy}
            disabled={!contractConfigured || !!deployDisabledReason}
            loading={
              transaction.phase === "building" ||
              transaction.phase === "awaiting-signature" ||
              transaction.phase === "submitted"
            }
            loadingLabel="Submitting…"
          >
            Sign & deploy vault
          </Button>
          {deployDisabledReason && <p className="text-xs text-muted">{deployDisabledReason}</p>}
        </div>
      )}

      <p className="text-xs text-muted">
        HeirVault never asks for your secret key. Only the public address and transaction signatures leave your
        wallet.
      </p>
    </div>
  );
}
