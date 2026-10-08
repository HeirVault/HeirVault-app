"use client";

import { Alert } from "@/components/ui/Alert";
import { AllocationEditor } from "@/components/beneficiaries/AllocationEditor";
import { InputField } from "@/components/ui/Field";
import { beneficiaryAmount, formatAllocation } from "@/lib/vault/calculations";
import { formatAssetAmount } from "@/lib/format";
import { TOTAL_ALLOCATION_BPS } from "@/lib/vault/types";

import type { WizardStepProps } from "./steps";

export function StepDistribution({ draft, beneficiaries }: WizardStepProps) {
  const { beneficiaries: list, totalBps, remainingBps, balanced, setAllocationPercent, autoBalance } =
    beneficiaries;

  const errors: Record<string, string> = {};
  for (const issue of beneficiaries.validation.issues) {
    if (issue.field.endsWith(".allocationBps")) {
      const index = Number(issue.field.split(".")[1]);
      const target = list[index];
      if (target) errors[target.id] = issue.message;
    }
  }

  return (
    <div className="space-y-6">
      <AllocationEditor
        beneficiaries={list}
        totalBps={totalBps}
        remainingBps={remainingBps}
        balanced={balanced}
        errorsByBeneficiary={errors}
        onAutoBalance={autoBalance}
      />

      <div className="space-y-4">
        {list.map((beneficiary, index) => (
          <div
            key={beneficiary.id}
            className="grid items-end gap-4 rounded-xl border border-border p-4 sm:grid-cols-[1fr_auto]"
          >
            <div>
              <p className="text-sm font-medium text-content-strong">
                {beneficiary.label || `Beneficiary ${index + 1}`}
              </p>
              <p className="mt-0.5 font-mono text-xs text-muted">{beneficiary.address || "No address"}</p>
              <p className="mt-1 text-xs text-muted">
                Receives{" "}
                {formatAssetAmount(
                  beneficiaryAmount(draft.asset.amount || "0", beneficiary.allocationBps, draft.asset.decimals),
                  draft.asset.symbol,
                  draft.asset.decimals,
                )}{" "}
                ({formatAllocation(beneficiary.allocationBps)})
              </p>
            </div>
            <InputField
              label="Share (%)"
              type="number"
              min={0}
              max={100}
              step={0.01}
              inputMode="decimal"
              value={beneficiary.allocationBps / 100}
              onChange={(event) => setAllocationPercent(beneficiary.id, Number(event.target.value))}
              error={errors[beneficiary.id]}
              containerClassName="sm:w-40"
              required
            />
          </div>
        ))}
      </div>

      {!balanced && (
        <Alert tone={remainingBps < 0 ? "danger" : "warning"} title="Total must equal 100%">
          Allocations currently total {formatAllocation(totalBps)} of {TOTAL_ALLOCATION_BPS / 100}%. The vault
          cannot be created until the shares sum to exactly 100%.
        </Alert>
      )}
    </div>
  );
}
