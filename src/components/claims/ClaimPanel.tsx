"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TxStatus } from "@/components/ui/TxStatus";
import { useWallet } from "@/hooks/useWallet";
import { useVault } from "@/hooks/useVault";
import {
  beneficiaryAmount,
  deriveClaimStatus,
  deriveVaultState,
  formatAllocation,
} from "@/lib/vault/calculations";
import { formatAssetAmount } from "@/lib/format";
import { IDLE_TRANSACTION, type TransactionState } from "@/lib/stellar/transactions";
import { CLAIM_STATUS_META, type Beneficiary, type Vault } from "@/lib/vault/types";

import { ClaimEligibilityNotice } from "./ClaimEligibilityNotice";
import { ClaimStatusBadge } from "./ClaimStatusBadge";

export interface ClaimPanelProps {
  vault: Vault;
  beneficiary: Beneficiary;
}

/**
 * The beneficiary's claim experience.
 *
 * The claim button is enabled only when the vault state says the allocation is
 * available. It still requires a signature, a successful simulation and a
 * confirmed transaction — so an enabled button is a *permission*, never a
 * promise of success.
 */
export function ClaimPanel({ vault, beneficiary }: ClaimPanelProps) {
  const wallet = useWallet();
  const { claim, contractConfigured } = useVault();
  const [confirming, setConfirming] = useState(false);
  const [tx, setTx] = useState<TransactionState>(IDLE_TRANSACTION);

  const state = deriveVaultState(vault);
  const claimStatus = deriveClaimStatus(vault, beneficiary.address);
  const isBeneficiary = !!wallet.address && wallet.address === beneficiary.address;
  const claimable = claimStatus === "available";
  const canClaim = contractConfigured && claimable && isBeneficiary && wallet.networkMatches;

  const amount = beneficiaryAmount(vault.asset.amount, beneficiary.allocationBps, vault.asset.decimals);

  async function runClaim() {
    setConfirming(false);
    const result = await claim(vault.id, beneficiary.address);
    setTx(result);
  }

  const disabledReason = (() => {
    if (!contractConfigured) return "No HeirVault contract is configured in this environment.";
    if (!isBeneficiary) return "Connect the beneficiary's wallet to claim.";
    if (!wallet.networkMatches) return "Your wallet must be on the app's network.";
    if (claimStatus === "claimed") return "This allocation has already been claimed.";
    if (claimStatus === "pending") return "Activation is still in progress.";
    if (claimStatus === "expired") return "The claim window has closed.";
    if (!claimable) return "The vault has not met its activation conditions yet.";
    return null;
  })();

  return (
    <Card>
      <CardHeader
        title="Your inheritance allocation"
        description={`${formatAllocation(beneficiary.allocationBps)} of this vault`}
        action={<ClaimStatusBadge status={claimStatus} />}
      />
      <CardBody className="space-y-4">
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Amount entitled</p>
          <p className="mt-1 text-2xl font-semibold text-content-strong">
            {formatAssetAmount(amount, vault.asset.symbol, vault.asset.decimals)}
          </p>
          <p className="mt-1 text-xs text-muted">{CLAIM_STATUS_META[claimStatus].description}</p>
        </div>

        <ClaimEligibilityNotice
          vault={vault}
          state={state}
          claimStatus={claimStatus}
          isBeneficiary={isBeneficiary}
        />

        {disabledReason && <Alert tone={claimable ? "warning" : "neutral"}>{disabledReason}</Alert>}

        <TxStatus state={tx} />
      </CardBody>
      <CardFooter>
        <p className="text-xs text-muted">
          Claiming transfers the allocation from the vault contract to your wallet.
        </p>
        <Button onClick={() => setConfirming(true)} disabled={!canClaim} loading={tx.phase === "awaiting-signature"}>
          Claim assets
        </Button>
      </CardFooter>

      <ConfirmDialog
        open={confirming}
        title="Claim your allocation?"
        description="This submits a signed transaction to the HeirVault contract."
        confirmLabel="Sign claim"
        onCancel={() => setConfirming(false)}
        onConfirm={runClaim}
        body={
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Amount</dt>
              <dd className="font-medium text-content-strong">
                {formatAssetAmount(amount, vault.asset.symbol, vault.asset.decimals)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Vault</dt>
              <dd className="font-mono text-xs text-content-strong">{vault.id}</dd>
            </div>
          </dl>
        }
      />
    </Card>
  );
}
