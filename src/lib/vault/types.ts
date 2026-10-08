/**
 * HeirVault domain model.
 *
 * These types are the contract between the UI, the local vault store and the
 * Soroban client boundary (`src/lib/stellar/contract.ts`). They intentionally
 * use plain JSON-serialisable shapes so a vault can round-trip through
 * localStorage today and a Soroban contract tomorrow.
 */

import type { StellarNetworkId } from "@/lib/stellar/network";

/** Lifecycle of a vault. Mirrors the states the contract is expected to expose. */
export const VAULT_STATUSES = [
  "draft",
  "active",
  "grace",
  "triggered",
  "completed",
  "cancelled",
] as const;

export type VaultStatus = (typeof VAULT_STATUSES)[number];

/** Display metadata for each vault status (label + design-system tone). */
export interface VaultStatusMeta {
  label: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  description: string;
}

export const VAULT_STATUS_META: Record<VaultStatus, VaultStatusMeta> = {
  draft: {
    label: "Draft",
    tone: "neutral",
    description: "Configured locally but not yet deployed to the network.",
  },
  active: {
    label: "Active",
    tone: "success",
    description: "Monitoring check-ins. Assets are locked in the vault.",
  },
  grace: {
    label: "Grace period",
    tone: "warning",
    description: "A check-in was missed. The grace period is running out.",
  },
  triggered: {
    label: "Triggered",
    tone: "warning",
    description: "Activation conditions met. Beneficiaries may claim.",
  },
  completed: {
    label: "Completed",
    tone: "info",
    description: "All allocations have been claimed and the vault is settled.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "danger",
    description: "The owner cancelled the vault before activation.",
  },
};

/** Basis points are used so allocations sum to exactly 10000 (= 100%). */
export const TOTAL_ALLOCATION_BPS = 10_000;

/** How a vault becomes claimable. */
export const ACTIVATION_TRIGGERS = [
  "missed-check-in",
  "scheduled",
  "guardian-approval",
  "manual",
] as const;

export type ActivationTrigger = (typeof ACTIVATION_TRIGGERS)[number];

export const ACTIVATION_TRIGGER_LABELS: Record<ActivationTrigger, string> = {
  "missed-check-in": "Missed check-in + grace period",
  scheduled: "Scheduled activation date",
  "guardian-approval": "Guardian threshold approval",
  manual: "Manual / emergency activation",
};

export interface ActivationConditions {
  trigger: ActivationTrigger;
  /** How often the owner must check in. */
  checkInIntervalDays: number;
  /** Extra time after a missed check-in before activation. */
  gracePeriodDays: number;
  /** ISO date for `scheduled` activation. */
  scheduledActivationAt?: string;
  /** Number of guardian approvals required when `guardian-approval`. */
  guardianThreshold: number;
  /** Whether the contract exposes an emergency activation entrypoint. */
  emergencyActivationEnabled: boolean;
}

export interface VaultAsset {
  /** SAC contract id (C...) of the asset held by the vault. */
  contractId: string;
  symbol: string;
  decimals: number;
  /** Amount held, as a decimal string in whole asset units. */
  amount: string;
}

/** Claim eligibility as *presented* by the contract. */
export const CLAIM_STATUSES = ["not-eligible", "pending", "available", "claimed", "expired"] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_STATUS_META: Record<ClaimStatus, VaultStatusMeta> = {
  "not-eligible": {
    label: "Not yet eligible",
    tone: "neutral",
    description: "The vault has not met its activation conditions.",
  },
  pending: {
    label: "Pending",
    tone: "warning",
    description: "Activation is in progress or awaiting guardian approvals.",
  },
  available: {
    label: "Claim available",
    tone: "success",
    description: "The contract permits this beneficiary to claim now.",
  },
  claimed: {
    label: "Claimed",
    tone: "info",
    description: "The allocation has already been claimed.",
  },
  expired: {
    label: "Expired",
    tone: "danger",
    description: "The claim window closed before the allocation was claimed.",
  },
};

export interface Beneficiary {
  id: string;
  /** Optional human label. Not stored on-chain. */
  label?: string;
  /** Stellar account address (G...). */
  address: string;
  /** Allocation in basis points. All beneficiaries of a vault sum to 10000. */
  allocationBps: number;
  relationship?: string;
  email?: string;
}

export interface BeneficiaryClaim {
  beneficiaryId: string;
  address: string;
  status: ClaimStatus;
  /** On-chain transaction hash once a claim has been confirmed. */
  claimTxHash?: string;
  claimedAt?: string;
}

export type GuardianRole = "primary" | "backup" | "arbiter";
export type GuardianApprovalStatus = "pending" | "approved" | "declined" | "revoked";

export interface Guardian {
  id: string;
  address: string;
  label?: string;
  role: GuardianRole;
  approvalStatus: GuardianApprovalStatus;
  /** ISO timestamp of the guardian's acceptance of the role. */
  respondedAt?: string;
}

export type VaultTransactionType =
  | "deploy"
  | "deposit"
  | "check-in"
  | "beneficiary-update"
  | "guardian-update"
  | "guardian-approval"
  | "activation"
  | "claim"
  | "cancel";

export interface VaultTransaction {
  hash: string;
  type: VaultTransactionType;
  /** Whether the network confirmed this transaction. */
  status: "pending" | "success" | "failed";
  ledger?: number;
  timestamp: string;
  amount?: string;
  counterparty?: string;
  explorerUrl?: string;
}

export interface Vault {
  /** Application-level id. Stable across deployments of the same vault. */
  id: string;
  /** Deployed contract id. Undefined until a real deployment is recorded. */
  contractId?: string;
  owner: string;
  name: string;
  description?: string;
  status: VaultStatus;
  network: StellarNetworkId;
  createdAt: string;
  asset: VaultAsset;
  beneficiaries: Beneficiary[];
  guardians: Guardian[];
  activation: ActivationConditions;
  /** Guardian addresses that have approved activation. */
  activationApprovals: string[];
  lastCheckInAt?: string;
  nextCheckInDueAt?: string;
  activatedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  transactions: VaultTransaction[];
  /** Per-beneficiary claim records reported by the contract. */
  claims?: BeneficiaryClaim[];
}

/** The data collected by the multi-step creation wizard, before deployment. */
export interface VaultDraft {
  name: string;
  description?: string;
  asset: {
    contractId: string;
    symbol: string;
    decimals: number;
    amount: string;
  };
  beneficiaries: Beneficiary[];
  guardians: Guardian[];
  activation: ActivationConditions;
}
