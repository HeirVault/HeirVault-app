/**
 * Tests for the contract → domain decoders.
 *
 * These decoders are the integration point between the HeirVault contract and
 * the UI. They must map every field of the contract's `#[contracttype]` structs
 * faithfully, convert unix-second timestamps and i128 base units, and throw on
 * anything they cannot represent rather than fabricating a vault.
 *
 * The payloads below mirror `contracts/heirvault/src/types.rs` field for field:
 * `u64`/`i128` arrive as `bigint` and `u32` arrives as `number`, exactly as
 * `scValToNative` returns them after a simulated read.
 */

import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { testAddress, testContractId } from "@/lib/vault/test-factories";

import {
  ContractReadError,
  activationModeFromTrigger,
  decodeBeneficiaryList,
  decodeClaimList,
  decodeDeadlines,
  decodeGatewayStatus,
  decodeGuardianList,
  decodeVaultInfo,
  decodeVaultPage,
  readVaultIdFromReturnValue,
  toAppVaultStatus,
  toDomainVault,
  triggerFromActivationMode,
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
const CHECK_IN_PERIOD = 90n * 86_400n;
const GRACE_PERIOD = 30n * 86_400n;

function nativeVaultInfo(overrides: Record<string, unknown> = {}) {
  const { vault: vaultOverrides, ...rest } = overrides as { vault?: Record<string, unknown> };

  const vault = {
    id: 3n,
    owner: testAddress(1),
    asset: testContractId(9),
    balance: 250_000_000_000n, // 25000.00 @ 7 decimals
    status: "Active",
    activation_mode: "MissedCheckIn",
    check_in_period: CHECK_IN_PERIOD,
    grace_period: GRACE_PERIOD,
    last_check_in: LAST_CHECK_IN,
    last_status_change: CREATED_AT,
    activated_at: 0n,
    distribution_balance: 0n,
    total_claimed: 0n,
    claimed_count: 0,
    beneficiaries: [
      { address: testAddress(2), allocation_bps: 6_000, active: true, claimed: false, claimed_amount: 0n },
      { address: testAddress(3), allocation_bps: 4_000, active: true, claimed: false, claimed_amount: 0n },
      { address: testAddress(5), allocation_bps: 0, active: false, claimed: false, claimed_amount: 0n },
    ],
    guardians: [
      { address: testAddress(4), active: true, approved: true },
      { address: testAddress(6), active: false, approved: false },
    ],
    guardian_threshold: 1,
    guardian_approvals: 1,
    created_at: CREATED_AT,
    schema_version: 1,
    ...vaultOverrides,
  };

  return {
    vault,
    deadline: LAST_CHECK_IN + CHECK_IN_PERIOD,
    grace_end: LAST_CHECK_IN + CHECK_IN_PERIOD + GRACE_PERIOD,
    effective_status: "Active",
    total_allocation_bps: 10_000,
    guardian_threshold: 1,
    guardian_approvals: 1,
    activation_ready: false,
    ...rest,
  };
}

describe("decodeVaultInfo", () => {
  it("maps a contract VaultInfo into the contract-facing shape", () => {
    const info = decodeVaultInfo(nativeVaultInfo(), context);

    expect(info.vault.id).toBe("3");
    expect(info.vault.owner).toBe(testAddress(1));
    expect(info.vault.assetContractId).toBe(testContractId(9));
    expect(info.vault.balance).toBe("250000000000");
    expect(info.vault.status).toBe("Active");
    expect(info.vault.activationMode).toBe("MissedCheckIn");
    expect(info.vault.checkInPeriodSeconds).toBe(Number(CHECK_IN_PERIOD));
    expect(info.vault.gracePeriodSeconds).toBe(Number(GRACE_PERIOD));
    expect(info.vault.createdAt).toBe(new Date(Number(CREATED_AT) * 1000).toISOString());
    expect(info.vault.lastCheckInAt).toBe(new Date(Number(LAST_CHECK_IN) * 1000).toISOString());
    expect(info.deadline).toBe(
      new Date(Number(LAST_CHECK_IN + CHECK_IN_PERIOD) * 1000).toISOString(),
    );
    expect(info.effectiveStatus).toBe("Active");
    expect(info.totalAllocationBps).toBe(10_000);
    expect(info.activationReady).toBe(false);
  });

  it("reports an unactivated vault as null, not as a zero date", () => {
    expect(decodeVaultInfo(nativeVaultInfo(), context).vault.activatedAt).toBeNull();
  });

  it("decodes a real activation timestamp", () => {
    const info = decodeVaultInfo(nativeVaultInfo({ vault: { activated_at: 1_800_000_000n } }), context);
    expect(info.vault.activatedAt).toBe(new Date(1_800_000_000 * 1000).toISOString());
  });

  it("drops deactivated beneficiary and guardian slots", () => {
    const { vault } = decodeVaultInfo(nativeVaultInfo(), context);
    expect(vault.beneficiaries.map((entry) => entry.address)).toEqual([
      testAddress(2),
      testAddress(3),
    ]);
    expect(vault.guardians.map((entry) => entry.address)).toEqual([testAddress(4)]);
  });

  it("derives guardian approval status from the contract's vote", () => {
    const { vault } = decodeVaultInfo(nativeVaultInfo(), context);
    expect(vault.guardians[0].approvalStatus).toBe("approved");

    const pending = decodeVaultInfo(
      nativeVaultInfo({ vault: { guardians: [{ address: testAddress(4), active: true, approved: false }] } }),
      context,
    );
    expect(pending.vault.guardians[0].approvalStatus).toBe("pending");
    // The contract stores no guardian role, so `primary` is a local default.
    expect(pending.vault.guardians[0].role).toBe("primary");
  });

  it("throws on an unknown status or activation mode", () => {
    expect(() => decodeVaultInfo(nativeVaultInfo({ vault: { status: "limbo" } }), context)).toThrow(
      ContractReadError,
    );
    expect(() =>
      decodeVaultInfo(nativeVaultInfo({ vault: { activation_mode: "Telepathy" } }), context),
    ).toThrow(ContractReadError);
    expect(() =>
      decodeVaultInfo(nativeVaultInfo({ effective_status: "Limbo" }), context),
    ).toThrow(ContractReadError);
  });

  it("throws on malformed or missing required fields", () => {
    expect(() => decodeVaultInfo(null, context)).toThrow(ContractReadError);
    expect(() => decodeVaultInfo({}, context)).toThrow(ContractReadError);
    expect(() => decodeVaultInfo(nativeVaultInfo({ vault: { created_at: 0n } }), context)).toThrow(
      ContractReadError,
    );
    expect(() =>
      decodeVaultInfo(nativeVaultInfo({ vault: { balance: "not-a-number" } }), context),
    ).toThrow(ContractReadError);
  });
});

describe("toAppVaultStatus", () => {
  it("maps every contract status onto the UI vocabulary", () => {
    expect(toAppVaultStatus("Active")).toBe("active");
    expect(toAppVaultStatus("GracePeriod")).toBe("grace");
    expect(toAppVaultStatus("Activated")).toBe("triggered");
    expect(toAppVaultStatus("Cancelled")).toBe("cancelled");
    expect(toAppVaultStatus("Completed")).toBe("completed");
  });
});

describe("activation mode mapping", () => {
  it("round-trips every mode the contract defines", () => {
    for (const trigger of ["missed-check-in", "guardian-approval", "multi-condition"] as const) {
      expect(triggerFromActivationMode(activationModeFromTrigger(trigger))).toBe(trigger);
    }
    expect(activationModeFromTrigger("missed-check-in")).toBe("MissedCheckIn");
    expect(activationModeFromTrigger("guardian-approval")).toBe("GuardianApproval");
    expect(activationModeFromTrigger("multi-condition")).toBe("MultiCondition");
  });

  it("rejects an unsupported trigger instead of guessing a mode", () => {
    // @ts-expect-error deliberately invalid trigger
    expect(() => activationModeFromTrigger("scheduled")).toThrow(ContractReadError);
  });
});

describe("toDomainVault", () => {
  it("builds a domain Vault from chain state", () => {
    const vault = toDomainVault(decodeVaultInfo(nativeVaultInfo(), context), [], null, context);

    expect(vault.id).toBe("3");
    expect(vault.contractId).toBe(testContractId(9));
    expect(vault.status).toBe("active");
    expect(vault.network).toBe("testnet");
    expect(vault.name).toBe("Vault #3");
    expect(vault.asset).toEqual({
      contractId: testContractId(9),
      symbol: "USDC",
      decimals: 7,
      amount: "25000",
    });
    expect(vault.activation).toEqual({
      trigger: "missed-check-in",
      checkInIntervalDays: 90,
      gracePeriodDays: 30,
      guardianThreshold: 1,
    });
    expect(vault.activationApprovals).toEqual([testAddress(4)]);
    expect(vault.nextCheckInDueAt).toBe(
      new Date(Number(LAST_CHECK_IN + CHECK_IN_PERIOD) * 1000).toISOString(),
    );
    expect(vault.activatedAt).toBeUndefined();
    expect(vault.transactions).toEqual([]);
  });

  it("lets local metadata supply names and labels without overriding the chain", () => {
    const local = {
      ...toDomainVault(decodeVaultInfo(nativeVaultInfo(), context), [], null, context),
      name: "Family Reserve",
      description: "Long-horizon reserve",
      beneficiaries: [
        { id: "b1", address: testAddress(2), allocationBps: 6_000, label: "Heir one" },
        { id: "b2", address: testAddress(3), allocationBps: 4_000 },
      ],
      guardians: [{ id: "g1", address: testAddress(4), role: "arbiter" as const, approvalStatus: "pending" as const, label: "Guardian one" }],
      transactions: [
        { hash: "abc", type: "deploy" as const, status: "success" as const, timestamp: "2026-01-01T00:00:00.000Z" },
      ],
    };

    const vault = toDomainVault(
      decodeVaultInfo(nativeVaultInfo({ vault: { balance: 1n } }), context),
      [],
      local,
      context,
    );

    expect(vault.name).toBe("Family Reserve");
    expect(vault.description).toBe("Long-horizon reserve");
    expect(vault.beneficiaries[0].label).toBe("Heir one");
    // The allocation still comes from the chain, never from the local copy.
    expect(vault.beneficiaries[0].allocationBps).toBe(6_000);
    expect(vault.asset.amount).toBe("0.0000001");
    expect(vault.guardians[0].label).toBe("Guardian one");
    expect(vault.guardians[0].role).toBe("arbiter");
    // The approval state is chain state, so the stale local `pending` loses.
    expect(vault.guardians[0].approvalStatus).toBe("approved");
    expect(vault.transactions).toHaveLength(1);
  });

  it("derives claim records from `get_claims`, ignoring deactivated heirs", () => {
    const claims = [
      { beneficiary: testAddress(2), allocationBps: 6_000, entitlement: "150000000000", claimedAmount: "0", claimed: false },
      { beneficiary: testAddress(3), allocationBps: 4_000, entitlement: "100000000000", claimedAmount: "0", claimed: false },
      { beneficiary: testAddress(5), allocationBps: 0, entitlement: "0", claimedAmount: "0", claimed: false },
    ];

    const vault = toDomainVault(decodeVaultInfo(nativeVaultInfo(), context), claims, null, context);

    expect(vault.claims).toHaveLength(2);
    expect(vault.claims?.[0]).toMatchObject({
      address: testAddress(2),
      status: "not-eligible",
    });
  });

  it("reports claims as available once the vault is activated", () => {
    const info = decodeVaultInfo(
      nativeVaultInfo({
        vault: { status: "Activated", activated_at: 1_800_000_000n },
        effective_status: "Activated",
      }),
      context,
    );
    const claims = [
      { beneficiary: testAddress(2), allocationBps: 6_000, entitlement: "150000000000", claimedAmount: "0", claimed: true },
    ];

    const vault = toDomainVault(info, claims, null, context);
    expect(vault.status).toBe("triggered");
    expect(vault.claims?.[0].status).toBe("claimed");
  });
});

describe("decodeVaultPage", () => {
  const page = {
    items: [
      {
        id: 1n,
        owner: testAddress(1),
        asset: testContractId(9),
        balance: 100n,
        status: "Active",
        activation_mode: "MissedCheckIn",
        check_in_period: CHECK_IN_PERIOD,
        grace_period: GRACE_PERIOD,
        last_check_in: LAST_CHECK_IN,
        deadline: LAST_CHECK_IN + CHECK_IN_PERIOD,
        grace_end: LAST_CHECK_IN + CHECK_IN_PERIOD + GRACE_PERIOD,
        beneficiary_count: 2,
        guardian_count: 1,
        total_allocation_bps: 10_000,
        schema_version: 1,
      },
    ],
    meta: { total: 1, offset: 0, limit: 25, has_more: false, next_offset: null },
  };

  it("decodes items and paging metadata", () => {
    const decoded = decodeVaultPage(page);
    expect(decoded.items).toHaveLength(1);
    expect(decoded.items[0].id).toBe("1");
    expect(decoded.items[0].status).toBe("Active");
    expect(decoded.items[0].beneficiaryCount).toBe(2);
    expect(decoded.meta).toEqual({ total: 1, offset: 0, limit: 25, hasMore: false, nextOffset: null });
  });

  it("reads a numeric next_offset", () => {
    const decoded = decodeVaultPage({
      ...page,
      meta: { ...page.meta, has_more: true, next_offset: 25 },
    });
    expect(decoded.meta.hasMore).toBe(true);
    expect(decoded.meta.nextOffset).toBe(25);
  });

  it("throws when the payload is not a page", () => {
    expect(() => decodeVaultPage([1, 2])).toThrow(ContractReadError);
    expect(() => decodeVaultPage({ items: "nope", meta: page.meta })).toThrow(ContractReadError);
  });
});

describe("list decoders", () => {
  it("drops deactivated beneficiary slots and keeps stable ids", () => {
    expect(
      decodeBeneficiaryList([
        { address: testAddress(2), allocation_bps: 6_000, active: true },
        { address: testAddress(5), allocation_bps: 0, active: false },
      ]),
    ).toEqual([{ id: "b1", address: testAddress(2), allocationBps: 6_000 }]);
  });

  it("treats a missing list as empty", () => {
    expect(decodeBeneficiaryList(null)).toEqual([]);
    expect(decodeGuardianList(undefined)).toEqual([]);
    expect(decodeClaimList(undefined)).toEqual([]);
  });

  it("throws when a list payload is not an array", () => {
    expect(() => decodeBeneficiaryList({ address: "x" })).toThrow(ContractReadError);
    expect(() => decodeGuardianList("nope")).toThrow(ContractReadError);
  });

  it("decodes claim records with entitlements in base units", () => {
    expect(
      decodeClaimList([
        { beneficiary: testAddress(2), allocation_bps: 6_000, entitlement: 150n, claimed_amount: 0n, claimed: false },
      ]),
    ).toEqual([
      {
        beneficiary: testAddress(2),
        allocationBps: 6_000,
        entitlement: "150",
        claimedAmount: "0",
        claimed: false,
      },
    ]);
  });
});

describe("decodeDeadlines / decodeGatewayStatus", () => {
  it("converts the check-in timestamps to ISO strings", () => {
    expect(
      decodeDeadlines({
        deadline: 1_700_000_000n,
        grace_end: 1_700_000_100n,
        now: 1_700_000_050n,
      }),
    ).toEqual({
      deadline: new Date(1_700_000_000 * 1000).toISOString(),
      graceEnd: new Date(1_700_000_100 * 1000).toISOString(),
      now: new Date(1_700_000_050 * 1000).toISOString(),
    });
  });

  it("decodes the guardian approval status", () => {
    expect(
      decodeGatewayStatus({ approvals: 1, threshold: 2, guardian_count: 3, threshold_met: false }),
    ).toEqual({ approvals: 1, threshold: 2, guardianCount: 3, thresholdMet: false });
  });
});

describe("readVaultIdFromReturnValue", () => {
  it("reads the u64 returned by create_vault", () => {
    expect(readVaultIdFromReturnValue(nativeToScVal(7n, { type: "u64" }))).toBe("7");
    expect(readVaultIdFromReturnValue(nativeToScVal(0n, { type: "u64" }))).toBe("0");
  });

  it("throws when the transaction returned nothing", () => {
    expect(() => readVaultIdFromReturnValue(undefined)).toThrow(ContractReadError);
  });

  it("throws instead of guessing when the return value is not a vault id", () => {
    expect(() => readVaultIdFromReturnValue(nativeToScVal("vault_1"))).toThrow(ContractReadError);
    expect(() =>
      readVaultIdFromReturnValue(xdr.ScVal.scvVoid() as unknown as xdr.ScVal),
    ).toThrow(ContractReadError);
  });
});
