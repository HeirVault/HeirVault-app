"use client";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { BeneficiaryForm } from "@/components/beneficiaries/BeneficiaryForm";
import { LIMITS } from "@/lib/vault/validation";

import type { WizardStepProps } from "./steps";

export function StepBeneficiaries({ beneficiaries, showErrors }: WizardStepProps) {
  const { beneficiaries: list, validation, canAdd, add, update, remove } = beneficiaries;
  const topLevelError = validation.issues.find((issue) => issue.field === "beneficiaries")?.message;

  return (
    <div className="space-y-5">
      <Alert tone="neutral">
        Beneficiaries are Stellar account addresses. Only the address and share are stored in the contract;
        labels and relationship notes stay in this app.
      </Alert>

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No beneficiaries yet. Add at least one heir to continue.
        </p>
      ) : (
        <div className="space-y-4">
          {list.map((beneficiary, index) => (
            <BeneficiaryForm
              key={beneficiary.id}
              beneficiary={beneficiary}
              index={index}
              showAllocation={false}
              otherAddresses={list
                .filter((other) => other.id !== beneficiary.id)
                .map((other) => other.address)}
              onChange={(patch) => update(beneficiary.id, patch)}
              onRemove={() => remove(beneficiary.id)}
              removable={list.length > 1}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <Button variant="secondary" onClick={() => add()} disabled={!canAdd}>
          Add beneficiary
        </Button>
        <p className="text-xs text-muted">
          {list.length} of {LIMITS.maxBeneficiaries} maximum
        </p>
      </div>

      {showErrors && topLevelError && (
        <Alert tone="danger" title="Beneficiaries incomplete">
          {topLevelError}
        </Alert>
      )}
    </div>
  );
}
