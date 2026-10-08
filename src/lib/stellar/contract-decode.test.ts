/**
 * Tests for the ScVal/native → domain `Vault` decoder.
 *
 * The decoder is the integration point between the HeirVault contract and the
 * UI. It must map every field faithfully, convert unix-second timestamps and
 * i128 base units, and throw on anything it cannot represent rather than
 * fabricating a vault.
 */

import { nativeToScVal } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { testAddress, testContractId } from "@/lib/vault/test-factories";

import {
  ContractReadError,
  decodeVaultList,
  decodeVaultRecord,
  decodeVaultScVal,
  type VaultDecodeContext,
} from "./contract";

const context: VaultDecodeContext = {
  network: "testnet",
  assetSymbol: "USDC",
  assetDecimals: 7,
  contractId: testContractId(9),
};

const CREATED_AT = 1_700_000_000n;
const LAST_CHECK_IN = 1_700_500_000n;

function nativeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "vault_1",
    owner: testAddress(1),
    name: "Family Reserve",
    description: "Long-horizon reserve",
    asset: testContractId(9),
    amount: 250_000_000_000n, // 25000.00 @ 7 decimals
    status: "active",
    created_at: CREATED_AT,
    last_check_in_at: LAST_CHECK_IN,
    beneficiaries: [
      { address: testAddress(2), allocation_bps: 6_000 },
      { address: testAddress(3), allocation_bps: 4_000 },
    ],
    guardians: [{ address: testAddress(4), role: "primary" }],
    activation: {
      trigger: "missed-check-in",
      check_in_interval_days: 90,
      grace_period_days: 30,
      guardian_threshold: 1,
      emergency_enabled: false,
    },
    ...overrides,
  };
}

describe("decodeVaultRecord", () => {
  it("maps a full record into the domain Vault shape", () => {
    const vault = decodeVaultRecord(nativeRecord(), context);

    expect(vault.id).toBe("vault_1");
    expect(vault.owner).toBe(testAddress(1));
    expect(vault.name).toBe("Family Reserve");
    expect(vault.description).toBe("Long-horizon reserve");
    expect(vault.status).toBe("active");
    expect(vault.network).toBe("testnet");
    expect(vault.contractId).toBe(testContractId(9));
    expect(vault.createdAt).toBe(new Date(Number(CREATED_AT) * 1000).toISOString());
    expect(vault.lastCheckInAt).toBe(new Date(Number(LAST_CHECK_IN) * 1000).toISOString());
  });

  it("converts the i128 amount from base units using the asset decimals", () => {
    expect(decodeVaultRecord(nativeRecord(), context).asset).toEqual({
      contractId: testContractId(9),
      symbol: "USDC",
      decimals: 7,
      amount: "25000",
    });
  });

  it("maps beneficiaries with stable ids and basis points", () => {
    const vault = decodeVaultRecord(nativeRecord(), context);
    expect(vault.beneficiaries).toEqual([
      { id: "b1", address: testAddress(2), allocationBps: 6_000 },
      { id: "b2", address: testAddress(3), allocationBps: 4_000 },
    ]);
  });

  it("maps guardians and defaults their approval status", () => {
    const vault = decodeVaultRecord(nativeRecord(), context);
    expect(vault.guardians).toEqual([
      { id: "g1", address: testAddress(4), role: "primary", approvalStatus: "pending" },
    ]);
  });

  it("falls back to the primary role for an unknown role", () => {
    const vault = decodeVaultRecord(
      nativeRecord({ guardians: [{ address: testAddress(4), role: "wizard" }] }),
      context,
    );
    expect(vault.guardians[0].role).toBe("primary");
  });

  it("maps the activation policy and omits an absent schedule", () => {
    const vault = decodeVaultRecord(nativeRecord(), context);
    expect(vault.activation).toEqual({
      trigger: "missed-check-in",
      checkInIntervalDays: 90,
      gracePeriodDays: 30,
      guardianThreshold: 1,
      emergencyActivationEnabled: false,
    });
  });

  it("decodes a scheduled activation timestamp", () => {
    const scheduledAt = 1_800_000_000n;
    const vault = decodeVaultRecord(
      nativeRecord({
        status: "completed",
        activation: {
          trigger: "scheduled",
          check_in_interval_days: 365,
          grace_period_days: 0,
          guardian_threshold: 1,
          emergency_enabled: false,
          scheduled_activation_at: scheduledAt,
        },
      }),
      context,
    );
    expect(vault.activation.trigger).toBe("scheduled");
    expect(vault.activation.scheduledActivationAt).toBe(
      new Date(Number(scheduledAt) * 1000).toISOString(),
    );
  });

  it("treats missing beneficiary/guardian lists as empty", () => {
    const vault = decodeVaultRecord(
      nativeRecord({ beneficiaries: null, guardians: undefined, last_check_in_at: null }),
      context,
    );
    expect(vault.beneficiaries).toEqual([]);
    expect(vault.guardians).toEqual([]);
    expect(vault.lastCheckInAt).toBeUndefined();
  });

  it("throws on an unknown status or trigger", () => {
    expect(() => decodeVaultRecord(nativeRecord({ status: "limbo" }), context)).toThrow(ContractReadError);
    expect(() =>
      decodeVaultRecord(
        nativeRecord({
          activation: {
            trigger: "telepathy",
            check_in_interval_days: 1,
            grace_period_days: 0,
            guardian_threshold: 1,
            emergency_enabled: false,
          },
        }),
        context,
      ),
    ).toThrow(ContractReadError);
  });

  it("throws on malformed or missing required fields", () => {
    expect(() => decodeVaultRecord(null, context)).toThrow(ContractReadError);
    expect(() => decodeVaultRecord({}, context)).toThrow(ContractReadError);
    expect(() => decodeVaultRecord(nativeRecord({ created_at: 0n }), context)).toThrow(ContractReadError);
    expect(() => decodeVaultRecord(nativeRecord({ amount: "not-a-number" }), context)).toThrow(
      ContractReadError,
    );
  });
});

describe("decodeVaultScVal", () => {
  it("round-trips a native record through an ScVal", () => {
    const direct = decodeVaultRecord(nativeRecord(), context);
    const fromScVal = decodeVaultScVal(nativeToScVal(nativeRecord()), context);

    expect(fromScVal.id).toBe(direct.id);
    expect(fromScVal.asset).toEqual(direct.asset);
    expect(fromScVal.beneficiaries).toEqual(direct.beneficiaries);
    expect(fromScVal.activation).toEqual(direct.activation);
    expect(fromScVal.createdAt).toBe(direct.createdAt);
  });
});

describe("decodeVaultList", () => {
  it("decodes a list of records", () => {
    const vaults = decodeVaultList([nativeRecord(), nativeRecord({ id: "vault_2" })], context);
    expect(vaults).toHaveLength(2);
    expect(vaults[1].id).toBe("vault_2");
  });

  it("treats null/undefined as an empty list", () => {
    expect(decodeVaultList(null, context)).toEqual([]);
    expect(decodeVaultList(undefined, context)).toEqual([]);
  });

  it("throws when the value is not a list", () => {
    expect(() => decodeVaultList({ id: "vault_1" }, context)).toThrow(ContractReadError);
  });
});
