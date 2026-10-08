"use client";

import { Alert } from "@/components/ui/Alert";
import { InputField, TextareaField } from "@/components/ui/Field";
import { LIMITS, validateVaultInfo } from "@/lib/vault/validation";
import { stepForField } from "@/lib/vault/validation";

import type { WizardStepProps } from "./steps";

export function StepInfo({ draft, update, showErrors }: WizardStepProps) {
  const validation = validateVaultInfo({ name: draft.name, description: draft.description });
  const errorFor = (field: string) =>
    showErrors ? validation.issues.find((issue) => issue.field === field)?.message : undefined;

  // Guard against future field additions landing on the wrong step.
  const misplaced = validation.issues.filter((issue) => stepForField(issue.field) !== "info");

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <InputField
          label="Vault name"
          placeholder="e.g. Family Reserve"
          value={draft.name}
          maxLength={LIMITS.vaultNameMax}
          onChange={(event) => update({ name: event.target.value })}
          onBlur={(event) => update({ name: event.target.value.trim() })}
          error={errorFor("name")}
          hint={`Between ${LIMITS.vaultNameMin} and ${LIMITS.vaultNameMax} characters. This is a label for the vault, not stored as personal data.`}
          required
        />
        <TextareaField
          label="Description"
          placeholder="What is this vault for?"
          value={draft.description ?? ""}
          maxLength={LIMITS.descriptionMax}
          onChange={(event) => update({ description: event.target.value })}
          error={errorFor("description")}
          hint={`Optional. ${(draft.description ?? "").length}/${LIMITS.descriptionMax} characters.`}
        />
      </div>

      <Alert tone="neutral" title="What happens next">
        You will choose the asset to protect, name your beneficiaries and their shares, add optional
        guardians, and decide what conditions release the inheritance.
      </Alert>

      {misplaced.length > 0 && (
        <Alert tone="warning" title="Unrelated validation issues">
          <ul className="list-inside list-disc">
            {misplaced.map((issue) => (
              <li key={issue.field}>{issue.message}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}
