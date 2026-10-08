"use client";

import { Alert } from "@/components/ui/Alert";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { Guardian } from "@/lib/vault/types";

export interface GuardianApprovalPanelProps {
  guardians: Guardian[];
  approvals: string[];
  threshold: number;
  /** Whether the current activation policy uses guardian approval. */
  isActiveTrigger: boolean;
}

/**
 * Shows progress toward the guardian approval threshold.
 * Solves the "threshold-based activation" requirement without inventing state:
 * the count comes straight from the vault's recorded approvals.
 */
export function GuardianApprovalPanel({
  guardians,
  approvals,
  threshold,
  isActiveTrigger,
}: GuardianApprovalPanelProps) {
  const approvedCount = guardians.filter(
    (guardian) => guardian.approvalStatus === "approved" && approvals.includes(guardian.address),
  ).length;
  const recordedCount = approvals.length;
  const effective = Math.max(approvedCount, recordedCount);
  const remaining = Math.max(0, threshold - effective);

  return (
    <Card>
      <CardHeader
        title="Guardian approvals"
        description={
          isActiveTrigger
            ? `Activation requires ${threshold} guardian ${threshold === 1 ? "approval" : "approvals"}.`
            : "Guardians are recorded for this vault, but activation does not depend on them."
        }
      />
      <CardBody className="space-y-4">
        <ProgressBar
          value={effective}
          max={Math.max(threshold, 1)}
          label="Guardian approvals recorded"
          tone={remaining === 0 ? "success" : "brand"}
          showValue
        />
        <p className="text-sm text-content">
          <span className="font-semibold text-content-strong">{effective}</span> of {threshold} approvals recorded
          {remaining > 0 && <span className="text-muted"> · {remaining} remaining</span>}
        </p>

        {guardians.length === 0 ? (
          <Alert tone="neutral">No guardians are configured for this vault.</Alert>
        ) : (
          <ul className="space-y-2">
            {guardians.map((guardian) => (
              <li
                key={guardian.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm text-content">
                  {guardian.label ?? `${guardian.address.slice(0, 10)}…`}
                </span>
                <span className="text-xs font-medium text-muted">
                  {approvals.includes(guardian.address) ? "Approved" : "Awaiting"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
