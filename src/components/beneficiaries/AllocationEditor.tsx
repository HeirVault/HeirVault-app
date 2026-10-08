"use client";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { bpsToPercent } from "@/lib/vault/calculations";
import { TOTAL_ALLOCATION_BPS, type Beneficiary } from "@/lib/vault/types";

import { AllocationBar } from "./AllocationBar";

export interface AllocationEditorProps {
  beneficiaries: Beneficiary[];
  totalBps: number;
  remainingBps: number;
  balanced: boolean;
  /** Validation messages keyed by beneficiary id. */
  errorsByBeneficiary?: Record<string, string>;
  onAutoBalance: () => void;
  onResetBalance?: () => void;
}

/**
 * The distribution step.
 *
 * Enforces the invariant that allocations total exactly 100% (10000 bps) before
 * the wizard will advance. `@contract` the Soroban contract must enforce the
 * same rule independently.
 */
export function AllocationEditor({
  beneficiaries,
  totalBps,
  remainingBps,
  balanced,
  errorsByBeneficiary = {},
  onAutoBalance,
}: AllocationEditorProps) {
  const tone = balanced ? "success" : remainingBps < 0 ? "danger" : "warning";

  return (
    <div className="space-y-5">
      <AllocationBar beneficiaries={beneficiaries} />

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-content-strong">
            Total allocated: {bpsToPercent(totalBps)}%
          </p>
          <Button variant="secondary" size="sm" onClick={onAutoBalance}>
            Split evenly
          </Button>
        </div>
        <ProgressBar
          className="mt-3"
          value={Math.min(totalBps, TOTAL_ALLOCATION_BPS)}
          max={TOTAL_ALLOCATION_BPS}
          label="Total allocation"
          tone={tone}
        />
        <p className="mt-2 text-xs text-muted">
          {balanced
            ? "Allocations total exactly 100%."
            : remainingBps > 0
              ? `${bpsToPercent(remainingBps)}% still unallocated.`
              : `Over-allocated by ${bpsToPercent(-remainingBps)}%.`}
        </p>
      </div>

      {!balanced && (
        <Alert tone={remainingBps < 0 ? "danger" : "warning"} title="Allocations must total 100%">
          Adjust the shares so they add up to exactly 100%. The HeirVault contract rejects any other total.
        </Alert>
      )}

      {Object.keys(errorsByBeneficiary).length > 0 && (
        <Alert tone="danger" title="Fix these allocations">
          <ul className="list-inside list-disc">
            {Object.entries(errorsByBeneficiary).map(([id, message]) => (
              <li key={id}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}
