"use client";

import { Alert, type AlertTone } from "@/components/ui/Alert";
import { formatDateTime } from "@/lib/format";
import type { VaultState } from "@/lib/vault/calculations";
import { ACTIVATION_TRIGGER_LABELS, CLAIM_STATUS_META, type ClaimStatus, type Vault } from "@/lib/vault/types";

export interface ClaimEligibilityNoticeProps {
  vault: Vault;
  state: VaultState;
  claimStatus: ClaimStatus;
  /** True when the connected wallet is this beneficiary. */
  isBeneficiary: boolean;
}

const TONES: Record<ClaimStatus, AlertTone> = {
  "not-eligible": "neutral",
  pending: "warning",
  available: "success",
  claimed: "info",
  expired: "danger",
};

/** Explains, in plain language, why a beneficiary can or cannot claim. */
export function ClaimEligibilityNotice({
  vault,
  state,
  claimStatus,
  isBeneficiary,
}: ClaimEligibilityNoticeProps) {
  const meta = CLAIM_STATUS_META[claimStatus];

  const detail = (() => {
    if (claimStatus === "claimed") return "The allocation has been transferred to your account.";
    if (claimStatus === "expired") return "The claim window for this vault has closed.";
    if (vault.status === "cancelled")
      return "The owner cancelled this vault, so no assets will be distributed.";
    if (vault.status === "draft")
      return "This vault has not been deployed to the network yet, so it cannot be claimed.";
    if (claimStatus === "available")
      return "The activation conditions are satisfied. You can claim your allocation now.";
    if (vault.activation.trigger === "guardian-approval")
      return `${state.guardianApprovalsRemaining} guardian approval(s) still required before the vault activates.`;
    if (vault.activation.trigger === "missed-check-in")
      return state.checkInOverdue
        ? `The owner missed their check-in. The grace period ends ${formatDateTime(state.graceDeadlineAt)}.`
        : `The owner is checking in on schedule. Next deadline: ${formatDateTime(state.nextCheckInDueAt)}.`;
    if (vault.activation.trigger === "scheduled")
      return `This vault activates on ${formatDateTime(vault.activation.scheduledActivationAt)}.`;
    return `Activation trigger: ${ACTIVATION_TRIGGER_LABELS[vault.activation.trigger]}.`;
  })();

  return (
    <Alert tone={TONES[claimStatus]} title={meta.label}>
      <p>{detail}</p>
      {!isBeneficiary && (
        <p className="mt-1 text-xs">
          This page is a public view. Connect the beneficiary&rsquo;s wallet to submit a claim.
        </p>
      )}
      {state.activationEligible && claimStatus !== "claimed" && claimStatus !== "available" && (
        <p className="mt-1 text-xs">
          If you believe you are eligible, refresh once the contract state has been re-read.
        </p>
      )}
    </Alert>
  );
}
