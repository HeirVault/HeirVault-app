"use client";

import { Alert } from "@/components/ui/Alert";
import { InputField, SelectField } from "@/components/ui/Field";
import {
  ACTIVATION_TRIGGERS,
  ACTIVATION_TRIGGER_LABELS,
  type ActivationTrigger,
} from "@/lib/vault/types";
import { LIMITS, validateActivation } from "@/lib/vault/validation";

import type { WizardStepProps } from "./steps";

const TRIGGER_HELP: Record<ActivationTrigger, string> = {
  "missed-check-in":
    "If you stop checking in, the vault opens for claims once the grace period has passed.",
  "guardian-approval": "Your guardians must collectively approve activation.",
  "multi-condition":
    "Both must happen: the grace period must lapse *and* the guardian threshold must be reached.",
};

export function StepActivation({ draft, update, showErrors }: WizardStepProps) {
  const activation = draft.activation;
  const validation = validateActivation(activation, {
    guardians: draft.guardians,
    hasBeneficiaries: draft.beneficiaries.length > 0,
  });
  const errorFor = (field: string) =>
    showErrors ? validation.issues.find((issue) => issue.field === field)?.message : undefined;

  const triggerOptions = ACTIVATION_TRIGGERS.map((trigger) => ({
    value: trigger,
    label: ACTIVATION_TRIGGER_LABELS[trigger],
  }));

  return (
    <div className="space-y-5">
      <SelectField
        label="Activation trigger"
        value={activation.trigger}
        options={triggerOptions}
        onChange={(event) =>
          update({ activation: { ...activation, trigger: event.target.value as ActivationTrigger } })
        }
        hint={TRIGGER_HELP[activation.trigger]}
        error={errorFor("activation.trigger")}
        required
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <InputField
          label="Check-in interval (days)"
          type="number"
          min={LIMITS.minCheckInIntervalDays}
          max={LIMITS.maxCheckInIntervalDays}
          step={1}
          value={activation.checkInIntervalDays}
          onChange={(event) =>
            update({
              activation: { ...activation, checkInIntervalDays: Number(event.target.value) || 0 },
            })
          }
          error={errorFor("activation.checkInIntervalDays")}
          hint="How often you must confirm you are still in control."
          required
        />
        <InputField
          label="Grace period (days)"
          type="number"
          min={0}
          max={LIMITS.maxGracePeriodDays}
          step={1}
          value={activation.gracePeriodDays}
          onChange={(event) =>
            update({ activation: { ...activation, gracePeriodDays: Number(event.target.value) || 0 } })
          }
          error={errorFor("activation.gracePeriodDays")}
          hint="Extra time after a missed check-in before activation."
          required
        />
      </div>

      {(activation.trigger === "guardian-approval" || activation.trigger === "multi-condition") && (
        <Alert tone={draft.guardians.length === 0 ? "warning" : "info"}>
          {draft.guardians.length === 0
            ? "Add guardians on the previous step before using a guardian-gated activation mode."
            : `${activation.guardianThreshold} of ${draft.guardians.length} guardian approvals will be required.`}
        </Alert>
      )}

      {showErrors && validation.issues.length > 0 && (
        <Alert tone="danger" title="Activation conditions incomplete">
          <ul className="list-inside list-disc">
            {validation.issues.map((issue) => (
              <li key={issue.field}>{issue.message}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}
