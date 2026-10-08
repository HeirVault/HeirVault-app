"use client";

import { Alert } from "@/components/ui/Alert";
import { GuardianForm } from "@/components/guardians/GuardianForm";
import { GuardianList, guardianLimitReached } from "@/components/guardians/GuardianList";
import { InputField } from "@/components/ui/Field";
import { generateId } from "@/lib/vault/repository";
import { LIMITS } from "@/lib/vault/validation";
import type { Guardian } from "@/lib/vault/types";

import type { WizardStepProps } from "./steps";

/**
 * Guardians are optional. They only *do* something when the activation policy
 * uses guardian approval, but they can always be recorded on the vault.
 */
export function StepGuardians({ draft, update, showErrors }: WizardStepProps) {
  const guardians = draft.guardians;

  function addGuardian(input: Omit<Guardian, "id" | "approvalStatus">) {
    if (guardianLimitReached(guardians.length)) return;
    update({
      guardians: [...guardians, { ...input, id: generateId("guardian"), approvalStatus: "pending" }],
    });
  }

  function removeGuardian(id: string) {
    update({ guardians: guardians.filter((guardian) => guardian.id !== id) });
  }

  const thresholdTooHigh = draft.activation.guardianThreshold > Math.max(guardians.length, 1);

  return (
    <div className="space-y-6">
      <Alert tone="neutral" title="Optional step">
        Guardians are additional Stellar accounts that can approve activation. Add them if you want a
        threshold-based release, or skip this step.
      </Alert>

      <GuardianForm
        onAdd={addGuardian}
        disabled={guardianLimitReached(guardians.length)}
        existingAddresses={guardians.map((guardian) => guardian.address)}
      />

      <GuardianList guardians={guardians} onRemove={removeGuardian} editable />

      <InputField
        label="Approvals required to activate"
        type="number"
        min={1}
        max={Math.max(guardians.length, 1)}
        step={1}
        value={draft.activation.guardianThreshold}
        onChange={(event) =>
          update({
            activation: {
              ...draft.activation,
              guardianThreshold: Math.max(1, Number(event.target.value) || 1),
            },
          })
        }
        error={
          showErrors && thresholdTooHigh
            ? `Threshold cannot exceed the number of guardians (${guardians.length}).`
            : undefined
        }
        hint={`Up to ${LIMITS.maxGuardians} guardians. This is only used when activation is guardian-approved.`}
      />
    </div>
  );
}
