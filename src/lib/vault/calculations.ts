/**
 * Pure vault calculations.
 *
 * Nothing in this file touches the network, the DOM or React state — every
 * function is deterministic and unit-tested. This is deliberate: the same maths
 * must hold on the client (for previews/validation) and be re-verified by the
 * Soroban contract (authoritative). Where a rule must be enforced on-chain, the
 * comment says so.
 */

import {
  TOTAL_ALLOCATION_BPS,
  type Beneficiary,
  type BeneficiaryClaim,
  type ClaimStatus,
  type Vault,
  type VaultStatus,
} from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Asset maths ──────────────────────────────────────────────────────────────

/**
 * Convert a human decimal amount ("12.5") into base units for a given number of
 * decimals (12.5 USDC @ 7 decimals → 125000000n).
 *
 * Uses string maths so it is exact for the whole range of token amounts, unlike
 * `parseFloat(amount) * 10 ** decimals`.
 *
 * @contract The Soroban `deposit`/`create_vault` entrypoints must apply the
 *           identical scaling; amounts are transmitted as `i128` base units.
 */
export function toBaseUnits(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  if (!trimmed) return 0n;
  if (!/^\d*(\.\d*)?$/.test(trimmed)) {
    throw new Error(`"${amount}" is not a valid decimal amount.`);
  }

  const [wholePart = "0", fractionPart = ""] = trimmed.split(".");
  const paddedFraction = fractionPart.padEnd(decimals, "0").slice(0, decimals);
  const normalisedWhole = wholePart === "" ? "0" : wholePart;
  return BigInt(`${normalisedWhole}${paddedFraction}`);
}

/** Inverse of {@link toBaseUnits}: 125000000n @ 7 → "12.5". */
export function fromBaseUnits(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals) || "0";
  const fraction = decimals > 0 ? digits.slice(digits.length - decimals) : "";
  const trimmedFraction = fraction.replace(/0+$/, "");
  const result = trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
  return negative ? `-${result}` : result;
}

/** Sum a list of asset amounts given an asset's decimals. */
export function sumAmounts(amounts: string[], decimals: number): string {
  const total = amounts.reduce((acc, amount) => acc + toBaseUnits(amount, decimals), 0n);
  return fromBaseUnits(total, decimals);
}

// ── Allocation maths ─────────────────────────────────────────────────────────

/** Total allocation across beneficiaries, in basis points (0–10000). */
export function totalAllocationBps(beneficiaries: Pick<Beneficiary, "allocationBps">[]): number {
  return beneficiaries.reduce((sum, b) => sum + (Number.isFinite(b.allocationBps) ? b.allocationBps : 0), 0);
}

/** Basis points → percentage (10000 → 100). */
export function bpsToPercent(bps: number): number {
  return bps / 100;
}

/** Percentage → basis points (100 → 10000). Rounded to the nearest bp. */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

/** Human label for an allocation, e.g. 3333 bps → "33.33%". */
export function formatAllocation(bps: number): string {
  const percent = bpsToPercent(bps);
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2).replace(/0$/, "")}%`;
}

/** The vault asset amount allocated to a single beneficiary. */
export function beneficiaryAmount(
  vaultAmount: string,
  allocationBps: number,
  decimals: number,
): string {
  const total = toBaseUnits(vaultAmount, decimals);
  // Integer division mirrors an on-chain integer split; dust stays in the vault.
  return fromBaseUnits((total * BigInt(allocationBps)) / BigInt(TOTAL_ALLOCATION_BPS), decimals);
}

// ── Date / check-in maths ────────────────────────────────────────────────────

export function addDays(date: Date | string, days: number): Date {
  const base = typeof date === "string" ? new Date(date) : date;
  return new Date(base.getTime() + days * MS_PER_DAY);
}

export function daysBetween(from: Date | string, to: Date | string): number {
  const start = typeof from === "string" ? new Date(from) : from;
  const end = typeof to === "string" ? new Date(to) : to;
  return (end.getTime() - start.getTime()) / MS_PER_DAY;
}

/** When the next check-in becomes overdue, based on the last check-in. */
export function computeNextCheckInDueAt(vault: Vault): Date {
  const last = vault.lastCheckInAt ?? vault.createdAt;
  return addDays(last, vault.activation.checkInIntervalDays);
}

/** The moment activation becomes possible after a missed check-in. */
export function computeGraceDeadlineAt(vault: Vault): Date {
  return addDays(computeNextCheckInDueAt(vault), vault.activation.gracePeriodDays);
}

export interface Countdown {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

/** Break a duration into display units. Negative durations clamp to zero. */
export function toCountdown(targetMs: number, nowMs: number): Countdown {
  const totalMs = Math.max(0, targetMs - nowMs);
  return {
    totalMs,
    days: Math.floor(totalMs / MS_PER_DAY),
    hours: Math.floor((totalMs % MS_PER_DAY) / 3_600_000),
    minutes: Math.floor((totalMs % 3_600_000) / 60_000),
    seconds: Math.floor((totalMs % 60_000) / 1000),
    expired: targetMs - nowMs <= 0,
  };
}

// ── Vault status derivation ──────────────────────────────────────────────────

export interface VaultState {
  status: VaultStatus;
  nextCheckInDueAt: string;
  graceDeadlineAt: string;
  /** True when the check-in deadline has passed. */
  checkInOverdue: boolean;
  /** True once the grace period after a missed check-in has elapsed. */
  graceElapsed: boolean;
  /** Number of guardian approvals still required to activate. */
  guardianApprovalsRemaining: number;
  /** Whether the activation conditions are satisfied *right now*. */
  activationEligible: boolean;
}

/**
 * Derive the vault's live status from its configuration and timestamps.
 *
 * Terminal states recorded on the vault (`completed`, `cancelled`) always win;
 * `draft` never activates. Everything else is computed from the activation
 * policy so the UI stays consistent even if a cached status is stale.
 *
 * @contract The contract is authoritative. This function must be kept in sync
 *           with it and only ever used for display/validation.
 */
export function deriveVaultState(vault: Vault, now: Date = new Date()): VaultState {
  const dueAt = computeNextCheckInDueAt(vault);
  const graceAt = computeGraceDeadlineAt(vault);
  const approvedCount = vault.activationApprovals.filter((address) =>
    vault.guardians.some((g) => g.address === address && g.approvalStatus === "approved"),
  ).length;
  const threshold = Math.max(1, vault.activation.guardianThreshold);
  const guardianApprovalsRemaining = Math.max(0, threshold - approvedCount);

  const checkInOverdue = now.getTime() > dueAt.getTime();
  const graceElapsed = now.getTime() > graceAt.getTime();

  const byCheckIn =
    vault.activation.trigger === "missed-check-in" && checkInOverdue && graceElapsed;
  const bySchedule =
    vault.activation.trigger === "scheduled" &&
    !!vault.activation.scheduledActivationAt &&
    now.getTime() >= new Date(vault.activation.scheduledActivationAt).getTime();
  const byGuardians =
    vault.activation.trigger === "guardian-approval" && guardianApprovalsRemaining === 0;
  const byManual = vault.activation.trigger === "manual" && Boolean(vault.activatedAt);

  const activationEligible = Boolean(vault.activatedAt) || byCheckIn || bySchedule || byGuardians || byManual;

  let status: VaultStatus = vault.status;

  if (vault.status === "draft") {
    status = "draft";
  } else if (vault.status === "cancelled" || vault.status === "completed") {
    status = vault.status;
  } else if (activationEligible) {
    status = "triggered";
  } else if (vault.activation.trigger === "missed-check-in" && checkInOverdue) {
    status = "grace";
  } else {
    status = "active";
  }

  return {
    status,
    nextCheckInDueAt: dueAt.toISOString(),
    graceDeadlineAt: graceAt.toISOString(),
    checkInOverdue,
    graceElapsed,
    guardianApprovalsRemaining,
    activationEligible,
  };
}

// ── Claim eligibility ────────────────────────────────────────────────────────

/**
 * Present a beneficiary's claim eligibility.
 *
 * IMPORTANT: this is a *presentation* helper. The contract remains the source
 * of truth for whether a claim will succeed; the UI must only offer the claim
 * action when the contract confirms it.
 */
export function deriveClaimStatus(
  vault: Vault,
  beneficiaryAddress: string,
  now: Date = new Date(),
): ClaimStatus {
  const claim = findClaim(vault, beneficiaryAddress);

  if (claim?.status === "claimed") return "claimed";
  if (claim?.status === "expired") return "expired";

  const state = deriveVaultState(vault, now);

  if (vault.status === "cancelled" || vault.status === "draft") return "not-eligible";
  if (state.status === "triggered" || state.status === "completed") return "available";

  const beneficiary = vault.beneficiaries.find((b) => b.address === beneficiaryAddress);
  if (!beneficiary) return "not-eligible";

  if (vault.activation.trigger === "guardian-approval" && vault.activationApprovals.length > 0) {
    return "pending";
  }
  if (vault.activation.trigger === "missed-check-in" && state.checkInOverdue) {
    return "pending";
  }
  if (vault.activation.trigger === "scheduled" && !state.activationEligible) {
    return "pending";
  }

  return "not-eligible";
}

export function findClaim(vault: Vault, beneficiaryAddress: string): BeneficiaryClaim | undefined {
  return vault.claims?.find((claim) => claim.address === beneficiaryAddress);
}

// ── Aggregate helpers ────────────────────────────────────────────────────────

/** Total value locked across the supplied vaults, in base units per asset. */
export function aggregateProtectedAssets(vaults: Vault[]): number {
  return vaults.reduce((sum, vault) => {
    if (vault.status === "cancelled" || vault.status === "draft") return sum;
    const amount = Number(vault.asset.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

export function countBeneficiaries(vault: Vault): number {
  return vault.beneficiaries.length;
}
