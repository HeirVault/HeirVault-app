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
  scheduled: "The vault opens automatically on a date you choose.",
  "guardian-approval": "Your guardians must collectively approve activation.",
  manual: "Activation is requested explicitly, e.g. in an emergency. Requires emergency activation enabled.",
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

      {activation.trigger === "scheduled" && (
        <InputField
          label="Scheduled activation date"
          type="datetime-local"
          value={activation.scheduledActivationAt ? activation.scheduledActivationAt.slice(0, 16) : ""}
          onChange={(event) =>
            update({
              activation: {
                ...activation,
                scheduledActivationAt: event.target.value
                  ? new Date(event.target.value).toISOString()
                  : undefined,
              },
            })
          }
          error={errorFor("activation.scheduledActivationAt")}
          hint="The vault becomes claimable at this moment."
          required
        />
      )}

      {activation.trigger === "guardian-approval" && (
        <Alert tone={draft.guardians.length === 0 ? "warning" : "info"}>
          {draft.guardians.length === 0
            ? "Add guardians on the previous step before using guardian approval."
            : `${activation.guardianThreshold} of ${draft.guardians.length} guardian approvals will be required.`}
        </Alert>
      )}

      <label className="flex items-start gap-3 rounded-xl border border-border p-4">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500"
          checked={activation.emergencyActivationEnabled}
          onChange={(event) =>
            update({
              activation: { ...activation, emergencyActivationEnabled: event.target.checked },
            })
          }
        />
        <span>
          <span className="block text-sm font-medium text-content-strong">
            Allow manual / emergency activation
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            Only enable this if the deployed contract exposes the emergency entrypoint. The frontend will
            surface the action but the contract is the final authority.
          </span>
        </span>
      </label>

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
