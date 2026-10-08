import type { VaultDraft } from "@/lib/vault/types";

import type { UseBeneficiariesResult } from "@/hooks/useBeneficiaries";

/** The eight steps of the vault creation flow, in order. */
export const WIZARD_STEP_DEFINITIONS = [
  { id: "info", label: "Vault information", short: "Info" },
  { id: "asset", label: "Asset & deposit", short: "Asset" },
  { id: "beneficiaries", label: "Beneficiaries", short: "Heirs" },
  { id: "distribution", label: "Distribution", short: "Shares" },
  { id: "guardians", label: "Guardians", short: "Guardians" },
  { id: "activation", label: "Check-in & activation", short: "Activation" },
  { id: "review", label: "Review", short: "Review" },
  { id: "confirm", label: "Wallet confirmation", short: "Confirm" },
] as const;

export type WizardStepId = (typeof WIZARD_STEP_DEFINITIONS)[number]["id"];

export const LAST_EDITABLE_STEP = 6; // index of "review"
export const CONFIRM_STEP = 7;

export interface WizardStepProps {
  draft: VaultDraft;
  update: (patch: Partial<VaultDraft>) => void;
  /** Beneficiary editing API, owned by the wizard so state survives navigation. */
  beneficiaries: UseBeneficiariesResult;
  /** Optional available balance for the selected asset. */
  available?: string;
  /** Whether the step should render its validation errors. */
  showErrors: boolean;
}
