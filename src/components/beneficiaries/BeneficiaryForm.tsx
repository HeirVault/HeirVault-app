"use client";

import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Field";
import { isValidStellarAddress } from "@/lib/vault/validation";
import type { Beneficiary } from "@/lib/vault/types";

export interface BeneficiaryFormProps {
  beneficiary: Beneficiary;
  index: number;
  /** Other beneficiary addresses, for duplicate detection. */
  otherAddresses: string[];
  onChange: (patch: Partial<Beneficiary>) => void;
  onRemove: () => void;
  removable: boolean;
  /** Validation message for the allocation field, when present. */
  allocationError?: string;
  /** Shown next to the percentage input, e.g. the computed asset amount. */
  allocationHint?: string;
  /** Hide the allocation field (shown on the dedicated distribution step). */
  showAllocation?: boolean;
}

export function BeneficiaryForm({
  beneficiary,
  index,
  otherAddresses,
  onChange,
  onRemove,
  removable,
  allocationError,
  allocationHint,
  showAllocation = true,
}: BeneficiaryFormProps) {
  const trimmed = beneficiary.address.trim();
  const duplicate = otherAddresses.some(
    (other) => other.toUpperCase() === trimmed.toUpperCase(),
  );
  const addressError =
    !trimmed
      ? undefined
      : !isValidStellarAddress(trimmed)
        ? "Enter a valid Stellar account address (G…)."
        : duplicate
          ? "This address is already a beneficiary."
          : undefined;

  return (
    <fieldset className="rounded-xl border border-border p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        Beneficiary {index + 1}
      </legend>

      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          label="Stellar address"
          placeholder="G…"
          value={beneficiary.address}
          onChange={(event) => onChange({ address: event.target.value })}
          error={addressError}
          required
        />
        <InputField
          label="Label"
          placeholder="e.g. Eldest daughter"
          value={beneficiary.label ?? ""}
          onChange={(event) => onChange({ label: event.target.value })}
          hint="Optional — kept in this app only."
        />
        <InputField
          label="Relationship"
          placeholder="e.g. Child"
          value={beneficiary.relationship ?? ""}
          onChange={(event) => onChange({ relationship: event.target.value })}
        />
        {showAllocation && (
          <InputField
            label="Allocation (%)"
            type="number"
            min={0}
            max={100}
            step={0.01}
            inputMode="decimal"
            value={beneficiary.allocationBps / 100}
            onChange={(event) => {
              const percent = Number(event.target.value);
              onChange({ allocationBps: Number.isFinite(percent) ? Math.round(percent * 100) : 0 });
            }}
            error={allocationError}
            hint={allocationHint}
            required
          />
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onRemove} disabled={!removable}>
          Remove beneficiary
        </Button>
      </div>
    </fieldset>
  );
}
