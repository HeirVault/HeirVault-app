/**
 * DEVELOPMENT FIXTURES — NOT REAL DATA.
 *
 * These vaults exist so the UI can be developed and demoed without a deployed
 * contract or a funded wallet. They are:
 *
 *   1. only loaded when `NEXT_PUBLIC_ENABLE_DEV_FIXTURES === "true"`;
 *   2. always rendered with a "Development data" banner;
 *   3. never presented as blockchain state — every fixture transaction uses the
 *      `fixture-` hash prefix and no explorer link is generated for it.
 *
 * Addresses are derived deterministically at runtime from fixed seeds, so they
 * are *format-valid* Stellar addresses (the UI's address validation is exercised
 * end-to-end) but they belong to nobody. No secret keys exist anywhere.
 */

import { addDays } from "./calculations";
import { encodeEd25519PublicKey } from "./strkey";
import { TOTAL_ALLOCATION_BPS, type Vault } from "./types";

/** Derive a deterministic, format-valid public key from a seed string. */
function deterministicAddress(seed: string): string {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = (seed.charCodeAt(i % seed.length) * (i + 1) + i * 31) & 0xff;
  }
  return encodeEd25519PublicKey(bytes);
}

export const FIXTURE_ADDRESSES = {
  owner: deterministicAddress("heirvault-fixture-owner"),
  heir1: deterministicAddress("heirvault-fixture-heir-1"),
  heir2: deterministicAddress("heirvault-fixture-heir-2"),
  heir3: deterministicAddress("heirvault-fixture-heir-3"),
  guardian1: deterministicAddress("heirvault-fixture-guardian-1"),
  guardian2: deterministicAddress("heirvault-fixture-guardian-2"),
} as const;

/** The asset used by fixtures. Placeholder id until a SAC is configured. */
const FIXTURE_ASSET_CONTRACT = process.env.NEXT_PUBLIC_USDC_CONTRACT_ID?.trim() || "";
const FIXTURE_ASSET_SYMBOL = process.env.NEXT_PUBLIC_USDC_SYMBOL?.trim() || "USDC";
const FIXTURE_ASSET_DECIMALS = Number(process.env.NEXT_PUBLIC_USDC_DECIMALS ?? 7) || 7;

function isoDaysFromNow(days: number): string {
  return addDays(new Date(), days).toISOString();
}

/** A vault with a durable check-in schedule. */
const activeVault: Vault = {
  id: "DEV-FIXTURE-ACTIVE",
  owner: FIXTURE_ADDRESSES.owner,
  name: "Family Reserve",
  description:
    "Development fixture. Long-horizon reserve intended to reach three heirs if the owner stops checking in.",
  status: "active",
  network: "testnet",
  createdAt: isoDaysFromNow(-120),
  asset: {
    contractId: FIXTURE_ASSET_CONTRACT,
    symbol: FIXTURE_ASSET_SYMBOL,
    decimals: FIXTURE_ASSET_DECIMALS,
    amount: "25000.00",
  },
  beneficiaries: [
    { id: "b1", address: FIXTURE_ADDRESSES.heir1, label: "Heir one", allocationBps: 5000, relationship: "Child" },
    { id: "b2", address: FIXTURE_ADDRESSES.heir2, label: "Heir two", allocationBps: 3000, relationship: "Child" },
    { id: "b3", address: FIXTURE_ADDRESSES.heir3, label: "Heir three", allocationBps: 2000, relationship: "Grandchild" },
  ],
  guardians: [
    { id: "g1", address: FIXTURE_ADDRESSES.guardian1, label: "Guardian one", role: "primary", approvalStatus: "approved", respondedAt: isoDaysFromNow(-100) },
    { id: "g2", address: FIXTURE_ADDRESSES.guardian2, label: "Guardian two", role: "backup", approvalStatus: "pending" },
  ],
  activation: {
    trigger: "missed-check-in",
    checkInIntervalDays: 90,
    gracePeriodDays: 30,
    guardianThreshold: 1,
    emergencyActivationEnabled: false,
  },
  activationApprovals: [],
  lastCheckInAt: isoDaysFromNow(-40),
  nextCheckInDueAt: isoDaysFromNow(50),
  transactions: [
    {
      hash: "fixture-deploy-hash",
      type: "deploy",
      status: "success",
      timestamp: isoDaysFromNow(-120),
      amount: "0",
    },
    {
      hash: "fixture-deposit-hash",
      type: "deposit",
      status: "success",
      timestamp: isoDaysFromNow(-120),
      amount: "25000.00",
    },
    {
      hash: "fixture-checkin-hash",
      type: "check-in",
      status: "success",
      timestamp: isoDaysFromNow(-40),
    },
  ],
  claims: [],
};

/** A vault whose grace period has elapsed — heirs can claim. */
const triggeredVault: Vault = {
  id: "DEV-FIXTURE-TRIGGERED",
  owner: FIXTURE_ADDRESSES.owner,
  name: "Study Fund",
  description: "Development fixture. Check-in missed, grace elapsed, activation conditions met.",
  status: "triggered",
  network: "testnet",
  createdAt: isoDaysFromNow(-400),
  activatedAt: isoDaysFromNow(-5),
  asset: {
    contractId: FIXTURE_ASSET_CONTRACT,
    symbol: FIXTURE_ASSET_SYMBOL,
    decimals: FIXTURE_ASSET_DECIMALS,
    amount: "8400.00",
  },
  beneficiaries: [
    { id: "b1", address: FIXTURE_ADDRESSES.heir1, label: "Heir one", allocationBps: 6000, relationship: "Nephew" },
    { id: "b2", address: FIXTURE_ADDRESSES.heir2, label: "Heir two", allocationBps: 4000, relationship: "Niece" },
  ],
  guardians: [
    { id: "g1", address: FIXTURE_ADDRESSES.guardian1, label: "Guardian one", role: "primary", approvalStatus: "approved", respondedAt: isoDaysFromNow(-30) },
  ],
  activation: {
    trigger: "missed-check-in",
    checkInIntervalDays: 180,
    gracePeriodDays: 60,
    guardianThreshold: 1,
    emergencyActivationEnabled: false,
  },
  activationApprovals: [FIXTURE_ADDRESSES.guardian1],
  lastCheckInAt: isoDaysFromNow(-300),
  nextCheckInDueAt: isoDaysFromNow(-120),
  transactions: [
    { hash: "fixture-deploy-hash-2", type: "deploy", status: "success", timestamp: isoDaysFromNow(-400) },
    { hash: "fixture-activation-hash", type: "activation", status: "success", timestamp: isoDaysFromNow(-5) },
  ],
  claims: [
    { beneficiaryId: "b1", address: FIXTURE_ADDRESSES.heir1, status: "available" },
    { beneficiaryId: "b2", address: FIXTURE_ADDRESSES.heir2, status: "available" },
  ],
};

/** A settled vault where every allocation has been claimed. */
const completedVault: Vault = {
  id: "DEV-FIXTURE-COMPLETED",
  owner: FIXTURE_ADDRESSES.owner,
  name: "Legacy Gift",
  description: "Development fixture. Fully distributed and settled.",
  status: "completed",
  network: "testnet",
  createdAt: isoDaysFromNow(-700),
  activatedAt: isoDaysFromNow(-200),
  completedAt: isoDaysFromNow(-30),
  asset: {
    contractId: FIXTURE_ASSET_CONTRACT,
    symbol: FIXTURE_ASSET_SYMBOL,
    decimals: FIXTURE_ASSET_DECIMALS,
    amount: "0.00",
  },
  beneficiaries: [
    { id: "b1", address: FIXTURE_ADDRESSES.heir1, label: "Heir one", allocationBps: TOTAL_ALLOCATION_BPS },
  ],
  guardians: [],
  activation: {
    trigger: "scheduled",
    checkInIntervalDays: 365,
    gracePeriodDays: 0,
    scheduledActivationAt: isoDaysFromNow(-200),
    guardianThreshold: 1,
    emergencyActivationEnabled: false,
  },
  activationApprovals: [],
  lastCheckInAt: isoDaysFromNow(-220),
  nextCheckInDueAt: isoDaysFromNow(-160),
  transactions: [
    { hash: "fixture-deploy-hash-3", type: "deploy", status: "success", timestamp: isoDaysFromNow(-700) },
    { hash: "fixture-claim-hash", type: "claim", status: "success", timestamp: isoDaysFromNow(-30), amount: "12000.00" },
  ],
  claims: [{ beneficiaryId: "b1", address: FIXTURE_ADDRESSES.heir1, status: "claimed", claimTxHash: "fixture-claim-hash", claimedAt: isoDaysFromNow(-30) }],
};

/** A vault the owner cancelled before any activation. */
const cancelledVault: Vault = {
  id: "DEV-FIXTURE-CANCELLED",
  owner: FIXTURE_ADDRESSES.owner,
  name: "Withdrawn Plan",
  description: "Development fixture. Cancelled by the owner; assets returned.",
  status: "cancelled",
  network: "testnet",
  createdAt: isoDaysFromNow(-300),
  cancelledAt: isoDaysFromNow(-60),
  asset: {
    contractId: FIXTURE_ASSET_CONTRACT,
    symbol: FIXTURE_ASSET_SYMBOL,
    decimals: FIXTURE_ASSET_DECIMALS,
    amount: "0.00",
  },
  beneficiaries: [
    { id: "b1", address: FIXTURE_ADDRESSES.heir2, label: "Heir two", allocationBps: TOTAL_ALLOCATION_BPS },
  ],
  guardians: [],
  activation: {
    trigger: "missed-check-in",
    checkInIntervalDays: 60,
    gracePeriodDays: 14,
    guardianThreshold: 1,
    emergencyActivationEnabled: false,
  },
  activationApprovals: [],
  lastCheckInAt: isoDaysFromNow(-120),
  nextCheckInDueAt: isoDaysFromNow(-60),
  transactions: [
    { hash: "fixture-deploy-hash-4", type: "deploy", status: "success", timestamp: isoDaysFromNow(-300) },
    { hash: "fixture-cancel-hash", type: "cancel", status: "success", timestamp: isoDaysFromNow(-60) },
  ],
  claims: [],
};

/** The fixture set, in the order they should appear in the dashboard. */
export const DEVELOPMENT_FIXTURES: Vault[] = [
  activeVault,
  triggeredVault,
  completedVault,
  cancelledVault,
];

export function areDevFixturesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_DEV_FIXTURES?.trim() === "true";
}
