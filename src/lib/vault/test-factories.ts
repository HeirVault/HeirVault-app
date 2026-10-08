/**
 * Test-only factories for the HeirVault domain model.
 *
 * Imported exclusively from `*.test.ts` files. Nothing in the application
 * imports this module, so it never reaches a production bundle. Addresses and
 * contract ids are derived deterministically so tests are reproducible and the
 * UI's strkey validation is exercised with genuinely format-valid values.
 */

import { Buffer } from "node:buffer";

import { StrKey } from "@stellar/stellar-sdk";

import { encodeEd25519PublicKey } from "./strkey";
import { TOTAL_ALLOCATION_BPS, type ActivationConditions, type Beneficiary, type Guardian, type Vault, type VaultDraft } from "./types";

/** A deterministic, format-valid Stellar account id (`G…`) for the byte `seed`. */
export function testAddress(seed: number): string {
  return encodeEd25519PublicKey(new Uint8Array(32).fill(seed & 0xff));
}

/** A deterministic, format-valid Soroban contract id (`C…`) for the byte `seed`. */
export function testContractId(seed: number): string {
  return StrKey.encodeContract(Buffer.from(new Uint8Array(32).fill(seed & 0xff)));
}

export function makeBeneficiary(overrides: Partial<Beneficiary> = {}): Beneficiary {
  return {
    id: "b1",
    address: testAddress(2),
    allocationBps: TOTAL_ALLOCATION_BPS,
    ...overrides,
  };
}

export function makeGuardian(overrides: Partial<Guardian> = {}): Guardian {
  return {
    id: "g1",
    address: testAddress(3),
    role: "primary",
    approvalStatus: "pending",
    ...overrides,
  };
}

export function makeActivation(overrides: Partial<ActivationConditions> = {}): ActivationConditions {
  return {
    trigger: "missed-check-in",
    checkInIntervalDays: 90,
    gracePeriodDays: 30,
    guardianThreshold: 1,
    emergencyActivationEnabled: false,
    ...overrides,
  };
}

export function makeVault(overrides: Partial<Vault> = {}): Vault {
  const createdAt = "2026-01-01T00:00:00.000Z";
  return {
    id: "vault_test",
    owner: testAddress(1),
    name: "Test Vault",
    status: "active",
    network: "testnet",
    createdAt,
    asset: {
      contractId: testContractId(9),
      symbol: "USDC",
      decimals: 7,
      amount: "100.00",
    },
    beneficiaries: [makeBeneficiary()],
    guardians: [],
    activation: makeActivation(),
    activationApprovals: [],
    lastCheckInAt: createdAt,
    transactions: [],
    claims: [],
    ...overrides,
  };
}

export function makeDraft(overrides: Partial<VaultDraft> = {}): VaultDraft {
  return {
    name: "Test Vault",
    description: "",
    asset: {
      contractId: testContractId(9),
      symbol: "USDC",
      decimals: 7,
      amount: "100.00",
    },
    beneficiaries: [makeBeneficiary()],
    guardians: [],
    activation: makeActivation(),
    ...overrides,
  };
}
