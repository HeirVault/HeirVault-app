"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { InputField, SelectField } from "@/components/ui/Field";
import { isValidStellarAddress } from "@/lib/vault/validation";
import type { Guardian, GuardianRole } from "@/lib/vault/types";

export interface GuardianFormProps {
  onAdd: (guardian: Omit<Guardian, "id" | "approvalStatus">) => void;
  disabled?: boolean;
  /** Addresses already added, to prevent duplicates. */
  existingAddresses?: string[];
}

const ROLE_OPTIONS: { value: GuardianRole; label: string }[] = [
  { value: "primary", label: "Primary — expected to act" },
  { value: "backup", label: "Backup — steps in if needed" },
  { value: "arbiter", label: "Arbiter — resolves disputes" },
];

export function GuardianForm({ onAdd, disabled = false, existingAddresses = [] }: GuardianFormProps) {
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<GuardianRole>("primary");
  const [touched, setTouched] = useState(false);

  const trimmed = address.trim();
  const duplicate = existingAddresses.some(
    (existing) => existing.toUpperCase() === trimmed.toUpperCase(),
  );
  const error = !touched || !trimmed
    ? undefined
    : !isValidStellarAddress(trimmed)
      ? "Enter a valid Stellar account address (G…)."
      : duplicate
        ? "This address is already a guardian."
        : undefined;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!isValidStellarAddress(trimmed) || duplicate) return;
    onAdd({ address: trimmed, label: label.trim() || undefined, role });
    setAddress("");
    setLabel("");
    setRole("primary");
    setTouched(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Add a guardian">
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          label="Guardian address"
          placeholder="G…"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          onBlur={() => setTouched(true)}
          error={error}
          hint="A Stellar account that can approve activation."
          required
        />
        <InputField
          label="Label"
          placeholder="e.g. Family solicitor"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          hint="Optional — shown only in this app."
        />
      </div>
      <SelectField
        label="Role"
        value={role}
        onChange={(event) => setRole(event.target.value as GuardianRole)}
        options={ROLE_OPTIONS}
      />
      <Button type="submit" disabled={disabled}>
        Add guardian
      </Button>
    </form>
  );
}
