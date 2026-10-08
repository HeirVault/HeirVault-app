/**
 * Vault validation rules.
 *
 * These rules mirror the invariants the Soroban contract must enforce. The
 * frontend validates so that users get immediate, accessible feedback; the
 * contract must *independently* re-validate every rule that protects funds
 * (especially the 100% allocation invariant). Where a rule must be enforced
 * on-chain it is marked `@contract`.
 */

import { bpsToPercent, percentToBps, totalAllocationBps } from "./calculations";
import { isValidContractId as isValidContractIdStrKey } from "./strkey";
import { isValidEd25519PublicKey } from "./strkey";
import {
  TOTAL_ALLOCATION_BPS,
  type ActivationConditions,
  type Beneficiary,
  type Guardian,
  type VaultDraft,
} from "./types";

export interface ValidationIssue {
  /** Dot-path of the offending field, e.g. `beneficiaries.2.allocationBps`. */
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export function ok(): ValidationResult {
  return { valid: true, issues: [] };
}

export function fromIssues(issues: ValidationIssue[]): ValidationResult {
  return { valid: issues.length === 0, issues };
}

export const LIMITS = {
  vaultNameMin: 3,
  vaultNameMax: 60,
  descriptionMax: 280,
  maxBeneficiaries: 20,
  maxGuardians: 10,
  minCheckInIntervalDays: 1,
  maxCheckInIntervalDays: 365,
  maxGracePeriodDays: 365,
  minGuardianThreshold: 1,
} as const;

// ── Primitive validators ─────────────────────────────────────────────────────

/** Full validation of a Stellar ed25519 public key, including checksum. */
export function isValidStellarAddress(value: string): boolean {
  return isValidEd25519PublicKey(value ?? "");
}

/** Full validation of a Soroban contract id (C... strkey, including checksum). */
export function isValidContractId(value: string): boolean {
  return isValidContractIdStrKey(value ?? "");
}

/**
 * Validate a decimal asset amount.
 *
 * @param available Optional available balance (whole units) used to detect
 *                  insufficient funds before a transaction is attempted.
 */
export function validateAmount(
  amount: string,
  decimals: number,
  options: { field?: string; available?: string; requirePositive?: boolean } = {},
): ValidationResult {
  const { field = "amount", available, requirePositive = true } = options;
  const trimmed = amount?.trim() ?? "";

  if (!trimmed) {
    return fromIssues([{ field, message: "Enter an amount." }]);
  }
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === ".") {
    return fromIssues([{ field, message: "Enter a valid number." }]);
  }

  const [, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    return fromIssues([{ field, message: `This asset supports at most ${decimals} decimals.` }]);
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return fromIssues([{ field, message: "Enter a valid number." }]);
  }
  if (requirePositive && value <= 0) {
    return fromIssues([{ field, message: "Amount must be greater than zero." }]);
  }
  if (available !== undefined) {
    const availableValue = Number(available);
    if (Number.isFinite(availableValue) && value > availableValue) {
      return fromIssues([{ field, message: `Amount exceeds the available balance of ${available}.` }]);
    }
  }

  return ok();
}

// ── Beneficiaries ────────────────────────────────────────────────────────────

/**
 * Validate the beneficiary set.
 *
 * @contract The contract MUST reject a beneficiary set whose allocations do not
 *           sum to exactly 10000 basis points (100%). This function provides the
 *           identical rule to the user before submission.
 */
export function validateBeneficiaries(beneficiaries: Beneficiary[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (beneficiaries.length === 0) {
    issues.push({ field: "beneficiaries", message: "Add at least one beneficiary." });
    return fromIssues(issues);
  }

  if (beneficiaries.length > LIMITS.maxBeneficiaries) {
    issues.push({
      field: "beneficiaries",
      message: `A vault can have at most ${LIMITS.maxBeneficiaries} beneficiaries.`,
    });
  }

  const seen = new Set<string>();
  beneficiaries.forEach((beneficiary, index) => {
    const path = `beneficiaries.${index}`;

    if (!isValidStellarAddress(beneficiary.address)) {
      issues.push({ field: `${path}.address`, message: "Enter a valid Stellar account address (G…)." });
    }

    const normalised = beneficiary.address.trim().toUpperCase();
    if (normalised && seen.has(normalised)) {
      issues.push({ field: `${path}.address`, message: "This address is already a beneficiary." });
    }
    seen.add(normalised);

    if (!Number.isInteger(beneficiary.allocationBps) || beneficiary.allocationBps <= 0) {
      issues.push({ field: `${path}.allocationBps`, message: "Allocation must be greater than 0%." });
    } else if (beneficiary.allocationBps > TOTAL_ALLOCATION_BPS) {
      issues.push({ field: `${path}.allocationBps`, message: "Allocation cannot exceed 100%." });
    }
  });

  const total = totalAllocationBps(beneficiaries);
  if (total !== TOTAL_ALLOCATION_BPS) {
    const delta = TOTAL_ALLOCATION_BPS - total;
    issues.push({
      field: "beneficiaries.total",
      message:
        delta > 0
          ? `Allocations must total exactly 100%. ${bpsToPercent(delta)}% still unallocated.`
          : `Allocations total ${bpsToPercent(total)}%. Reduce them by ${bpsToPercent(-delta)}%.`,
    });
  }

  return fromIssues(issues);
}

/** Suggest an even split as basis points, guaranteeing an exact 100% total. */
export function evenAllocationBps(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(TOTAL_ALLOCATION_BPS / count);
  const allocations = new Array(count).fill(base);
  allocations[0] += TOTAL_ALLOCATION_BPS - base * count; // remainder to the first heir
  return allocations;
}

/** Rebalance all-but-one beneficiary proportionally to keep a 100% total. */
export function autoBalanceBeneficiaries(beneficiaries: Beneficiary[]): Beneficiary[] {
  const allocations = evenAllocationBps(beneficiaries.length);
  return beneficiaries.map((beneficiary, index) => ({
    ...beneficiary,
    allocationBps: allocations[index] ?? 0,
  }));
}

/** Convert a percentage input into a safe, bounded basis-point value. */
export function allocationFromPercentInput(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(TOTAL_ALLOCATION_BPS, percentToBps(percent)));
}

// ── Guardians ────────────────────────────────────────────────────────────────

export function validateGuardians(guardians: Guardian[], threshold: number): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (guardians.length > LIMITS.maxGuardians) {
    issues.push({
      field: "guardians",
      message: `A vault can have at most ${LIMITS.maxGuardians} guardians.`,
    });
  }

  const seen = new Set<string>();
  guardians.forEach((guardian, index) => {
    const path = `guardians.${index}`;
    if (!isValidStellarAddress(guardian.address)) {
      issues.push({ field: `${path}.address`, message: "Enter a valid Stellar account address (G…)." });
    }
    const normalised = guardian.address.trim().toUpperCase();
    if (normalised && seen.has(normalised)) {
      issues.push({ field: `${path}.address`, message: "This address is already a guardian." });
    }
    seen.add(normalised);
  });

  if (guardians.length > 0) {
    if (threshold < LIMITS.minGuardianThreshold) {
      issues.push({ field: "activation.guardianThreshold", message: "Threshold must be at least 1." });
    } else if (threshold > guardians.length) {
      issues.push({
        field: "activation.guardianThreshold",
        message: `Threshold cannot exceed the number of guardians (${guardians.length}).`,
      });
    }
  }

  return fromIssues(issues);
}

// ── Vault information ────────────────────────────────────────────────────────

export function validateVaultInfo(input: { name: string; description?: string }): ValidationResult {
  const issues: ValidationIssue[] = [];
  const name = input.name?.trim() ?? "";

  if (!name) {
    issues.push({ field: "name", message: "Give the vault a name." });
  } else if (name.length < LIMITS.vaultNameMin) {
    issues.push({ field: "name", message: `Use at least ${LIMITS.vaultNameMin} characters.` });
  } else if (name.length > LIMITS.vaultNameMax) {
    issues.push({ field: "name", message: `Use at most ${LIMITS.vaultNameMax} characters.` });
  }

  if ((input.description?.length ?? 0) > LIMITS.descriptionMax) {
    issues.push({
      field: "description",
      message: `Keep the description under ${LIMITS.descriptionMax} characters.`,
    });
  }

  return fromIssues(issues);
}

// ── Activation conditions ────────────────────────────────────────────────────

export function validateActivation(
  activation: ActivationConditions,
  context: { guardians: Guardian[]; hasBeneficiaries: boolean },
): ValidationResult {
  const issues: ValidationIssue[] = [];

  const { checkInIntervalDays, gracePeriodDays } = activation;

  if (
    !Number.isInteger(checkInIntervalDays) ||
    checkInIntervalDays < LIMITS.minCheckInIntervalDays ||
    checkInIntervalDays > LIMITS.maxCheckInIntervalDays
  ) {
    issues.push({
      field: "activation.checkInIntervalDays",
      message: `Check-in interval must be between ${LIMITS.minCheckInIntervalDays} and ${LIMITS.maxCheckInIntervalDays} days.`,
    });
  }

  if (
    !Number.isInteger(gracePeriodDays) ||
    gracePeriodDays < 0 ||
    gracePeriodDays > LIMITS.maxGracePeriodDays
  ) {
    issues.push({
      field: "activation.gracePeriodDays",
      message: `Grace period must be between 0 and ${LIMITS.maxGracePeriodDays} days.`,
    });
  }

  if (activation.trigger === "scheduled") {
    if (!activation.scheduledActivationAt) {
      issues.push({
        field: "activation.scheduledActivationAt",
        message: "Choose the date the vault should activate.",
      });
    } else {
      const scheduled = new Date(activation.scheduledActivationAt);
      if (Number.isNaN(scheduled.getTime())) {
        issues.push({
          field: "activation.scheduledActivationAt",
          message: "Enter a valid activation date.",
        });
      } else if (scheduled.getTime() <= Date.now()) {
        issues.push({
          field: "activation.scheduledActivationAt",
          message: "The activation date must be in the future.",
        });
      }
    }
  }

  if (activation.trigger === "guardian-approval") {
    if (context.guardians.length === 0) {
      issues.push({
        field: "guardians",
        message: "Add at least one guardian to use guardian approval activation.",
      });
    }
    issues.push(...validateGuardians(context.guardians, activation.guardianThreshold).issues);
  }

  if (activation.trigger === "manual" && !activation.emergencyActivationEnabled) {
    issues.push({
      field: "activation.emergencyActivationEnabled",
      message: "Manual activation requires the emergency activation policy to be enabled.",
    });
  }

  if (!context.hasBeneficiaries) {
    issues.push({ field: "beneficiaries", message: "Add beneficiaries before choosing activation conditions." });
  }

  return fromIssues(issues);
}

// ── Whole-draft validation ───────────────────────────────────────────────────

export const WIZARD_STEPS = [
  "info",
  "asset",
  "beneficiaries",
  "distribution",
  "guardians",
  "activation",
  "review",
  "confirm",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Which wizard step a field belongs to, so we can gate navigation. */
export function stepForField(field: string): WizardStep {
  if (field.startsWith("beneficiaries")) {
    return field === "beneficiaries.total" ? "distribution" : "beneficiaries";
  }
  if (field.startsWith("guardians")) return "guardians";
  if (field.startsWith("activation")) return "activation";
  if (field.startsWith("asset") || field === "amount") return "asset";
  return "info";
}

export function validateDraft(draft: VaultDraft, options: { available?: string } = {}): ValidationResult {
  const issues: ValidationIssue[] = [];

  issues.push(...validateVaultInfo({ name: draft.name, description: draft.description }).issues);
  issues.push(...validateAmount(draft.asset.amount, draft.asset.decimals, { field: "asset.amount", available: options.available }).issues);

  if (!isValidContractId(draft.asset.contractId)) {
    issues.push({ field: "asset.contractId", message: "Choose a supported asset." });
  }

  issues.push(...validateBeneficiaries(draft.beneficiaries).issues);
  issues.push(...validateGuardians(draft.guardians, draft.activation.guardianThreshold).issues);
  issues.push(
    ...validateActivation(draft.activation, {
      guardians: draft.guardians,
      hasBeneficiaries: draft.beneficiaries.length > 0,
    }).issues,
  );

  return fromIssues(issues);
}

/** Whether a single wizard step is complete enough to advance. */
export function validateStep(
  step: WizardStep,
  draft: VaultDraft,
  options: { available?: string } = {},
): ValidationResult {
  const all = validateDraft(draft, options);
  const relevant = all.issues.filter((issue) => stepForField(issue.field) === step);
  return fromIssues(relevant);
}
