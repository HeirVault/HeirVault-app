/**
 * Unit tests for the pure vault calculations.
 *
 * These functions are the client-side mirror of the on-chain maths, so they are
 * tested against exact values rather than approximations.
 */

import { describe, expect, it } from "vitest";

import {
  addDays,
  aggregateProtectedAssets,
  beneficiaryAmount,
  bpsToPercent,
  computeGraceDeadlineAt,
  computeNextCheckInDueAt,
  countBeneficiaries,
  daysBetween,
  deriveClaimStatus,
  deriveVaultState,
  findClaim,
  formatAllocation,
  fromBaseUnits,
  percentToBps,
  sumAmounts,
  toBaseUnits,
  toCountdown,
} from "./calculations";
import { makeActivation, makeBeneficiary, makeGuardian, makeVault, testAddress } from "./test-factories";

const DAY = "2026-01-01T00:00:00.000Z";

describe("toBaseUnits", () => {
  it("scales whole and fractional amounts exactly", () => {
    expect(toBaseUnits("12.5", 7)).toBe(125_000_000n);
    expect(toBaseUnits("1", 7)).toBe(10_000_000n);
    expect(toBaseUnits("0", 7)).toBe(0n);
    expect(toBaseUnits("100.00", 7)).toBe(1_000_000_000n);
  });

  it("handles missing whole or fractional parts", () => {
    expect(toBaseUnits(".5", 7)).toBe(5_000_000n);
    expect(toBaseUnits("12.", 7)).toBe(120_000_000n);
  });

  it("treats blank input as zero", () => {
    expect(toBaseUnits("", 7)).toBe(0n);
    expect(toBaseUnits("   ", 7)).toBe(0n);
  });

  it("truncates beyond the asset precision", () => {
    expect(toBaseUnits("1.12345678", 7)).toBe(11_234_567n);
  });

  it("rejects non-decimal input", () => {
    expect(() => toBaseUnits("abc", 7)).toThrow();
    expect(() => toBaseUnits("1.2.3", 7)).toThrow();
    expect(() => toBaseUnits("1e5", 7)).toThrow();
    expect(() => toBaseUnits("-1", 7)).toThrow();
  });
});

describe("fromBaseUnits", () => {
  it("is the inverse of toBaseUnits for canonical amounts", () => {
    for (const amount of ["0", "1", "12.5", "999.9999999", "0.0000001"]) {
      expect(fromBaseUnits(toBaseUnits(amount, 7), 7)).toBe(amount);
    }
  });

  it("trims trailing zeros", () => {
    expect(fromBaseUnits(125_000_000n, 7)).toBe("12.5");
    expect(fromBaseUnits(0n, 7)).toBe("0");
    expect(fromBaseUnits(1n, 7)).toBe("0.0000001");
  });

  it("preserves the sign", () => {
    expect(fromBaseUnits(-125_000_000n, 7)).toBe("-12.5");
  });
});

describe("sumAmounts", () => {
  it("adds decimal amounts without floating point error", () => {
    expect(sumAmounts(["0.1", "0.2"], 7)).toBe("0.3");
    expect(sumAmounts(["1", "2.5", "0.0000001"], 7)).toBe("3.5000001");
    expect(sumAmounts([], 7)).toBe("0");
  });
});

describe("allocation maths", () => {
  it("converts between basis points and percent", () => {
    expect(bpsToPercent(10_000)).toBe(100);
    expect(bpsToPercent(3_333)).toBe(33.33);
    expect(percentToBps(100)).toBe(10_000);
    expect(percentToBps(33.33)).toBe(3_333);
  });

  it("formats allocations for display", () => {
    expect(formatAllocation(10_000)).toBe("100%");
    expect(formatAllocation(5_000)).toBe("50%");
    expect(formatAllocation(3_333)).toBe("33.33%");
    expect(formatAllocation(3_350)).toBe("33.5%");
  });

  it("splits a vault amount by allocation with integer division", () => {
    expect(beneficiaryAmount("100", 5_000, 7)).toBe("50");
    expect(beneficiaryAmount("100", 3_333, 7)).toBe("33.33");
    expect(beneficiaryAmount("100", 10_000, 7)).toBe("100");
  });

  it("drops rounding dust rather than inventing it", () => {
    // 1 unit split three ways at 3334/3333/3333 bps.
    const a = toBaseUnits(beneficiaryAmount("1", 3_334, 7), 7);
    const b = toBaseUnits(beneficiaryAmount("1", 3_333, 7), 7);
    const c = toBaseUnits(beneficiaryAmount("1", 3_333, 7), 7);
    expect(a + b + c).toBeLessThanOrEqual(toBaseUnits("1", 7));
  });
});

describe("date maths", () => {
  it("adds days across month boundaries", () => {
    expect(addDays(DAY, 90).toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(addDays(DAY, 30).toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("computes whole days between timestamps", () => {
    expect(daysBetween(DAY, "2026-01-31T00:00:00.000Z")).toBe(30);
    expect(daysBetween("2026-01-31T00:00:00.000Z", DAY)).toBe(-30);
  });

  it("derives the check-in and grace deadlines from the last check-in", () => {
    const vault = makeVault({ createdAt: DAY, lastCheckInAt: DAY });
    expect(computeNextCheckInDueAt(vault).toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(computeGraceDeadlineAt(vault).toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("falls back to createdAt when there is no check-in yet", () => {
    const vault = makeVault({ createdAt: DAY, lastCheckInAt: undefined });
    expect(computeNextCheckInDueAt(vault).toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
});

describe("toCountdown", () => {
  it("breaks a duration into display units", () => {
    const now = Date.parse(DAY);
    const target = now + 86_400_000 + 3_600_000 + 60_000 + 1_000;
    expect(toCountdown(target, now)).toEqual({
      totalMs: 90_061_000,
      days: 1,
      hours: 1,
      minutes: 1,
      seconds: 1,
      expired: false,
    });
  });

  it("clamps expired durations to zero", () => {
    const now = Date.parse(DAY);
    const result = toCountdown(now - 5_000, now);
    expect(result.totalMs).toBe(0);
    expect(result.expired).toBe(true);
  });
});

describe("deriveVaultState", () => {
  const now = (iso: string) => new Date(iso);

  it("keeps terminal and draft statuses", () => {
    expect(deriveVaultState(makeVault({ status: "draft" }), now("2026-02-01")).status).toBe("draft");
    expect(deriveVaultState(makeVault({ status: "cancelled" }), now("2026-02-01")).status).toBe("cancelled");
    expect(deriveVaultState(makeVault({ status: "completed" }), now("2026-02-01")).status).toBe("completed");
  });

  it("stays active before the check-in deadline", () => {
    const state = deriveVaultState(makeVault(), now("2026-01-15"));
    expect(state.status).toBe("active");
    expect(state.checkInOverdue).toBe(false);
    expect(state.graceElapsed).toBe(false);
    expect(state.activationEligible).toBe(false);
  });

  it("enters grace once a check-in is missed", () => {
    const state = deriveVaultState(makeVault(), now("2026-04-15"));
    expect(state.status).toBe("grace");
    expect(state.checkInOverdue).toBe(true);
    expect(state.graceElapsed).toBe(false);
    expect(state.activationEligible).toBe(false);
  });

  it("triggers when the grace period elapses", () => {
    const state = deriveVaultState(makeVault(), now("2026-05-15"));
    expect(state.status).toBe("triggered");
    expect(state.graceElapsed).toBe(true);
    expect(state.activationEligible).toBe(true);
  });

  it("handles scheduled activation", () => {
    const activation = makeActivation({
      trigger: "scheduled",
      scheduledActivationAt: "2026-06-01T00:00:00.000Z",
    });
    const future = deriveVaultState(makeVault({ activation }), now("2026-05-01"));
    expect(future.status).toBe("active");
    expect(future.activationEligible).toBe(false);

    const past = deriveVaultState(makeVault({ activation }), now("2026-06-02"));
    expect(past.status).toBe("triggered");
    expect(past.activationEligible).toBe(true);
  });

  it("counts guardian approvals toward the threshold", () => {
    const g1 = makeGuardian({ id: "g1", address: testAddress(3), approvalStatus: "approved" });
    const g2 = makeGuardian({ id: "g2", address: testAddress(4), approvalStatus: "pending" });
    const activation = makeActivation({ trigger: "guardian-approval", guardianThreshold: 2 });

    const partial = deriveVaultState(
      makeVault({ activation, guardians: [g1, g2], activationApprovals: [g1.address] }),
      now("2026-02-01"),
    );
    expect(partial.guardianApprovalsRemaining).toBe(1);
    expect(partial.activationEligible).toBe(false);
    expect(partial.status).toBe("active");

    const approvedG2 = { ...g2, approvalStatus: "approved" as const };
    const complete = deriveVaultState(
      makeVault({
        activation,
        guardians: [g1, approvedG2],
        activationApprovals: [g1.address, g2.address],
      }),
      now("2026-02-01"),
    );
    expect(complete.guardianApprovalsRemaining).toBe(0);
    expect(complete.activationEligible).toBe(true);
    expect(complete.status).toBe("triggered");
  });

  it("does not count approvals from guardians that are not approved", () => {
    const g1 = makeGuardian({ address: testAddress(3), approvalStatus: "pending" });
    const state = deriveVaultState(
      makeVault({ guardians: [g1], activationApprovals: [g1.address] }),
      now("2026-02-01"),
    );
    expect(state.guardianApprovalsRemaining).toBe(1);
  });

  it("treats an activatedAt stamp as eligible regardless of trigger", () => {
    const state = deriveVaultState(makeVault({ activatedAt: DAY }), now("2026-01-15"));
    expect(state.activationEligible).toBe(true);
    expect(state.status).toBe("triggered");
  });
});

describe("deriveClaimStatus", () => {
  const beneficiary = makeBeneficiary({ address: testAddress(2) });

  it("reports a recorded claim as claimed and an expired one as expired", () => {
    const claimed = makeVault({
      activatedAt: DAY,
      beneficiaries: [beneficiary],
      claims: [{ beneficiaryId: beneficiary.id, address: beneficiary.address, status: "claimed" }],
    });
    expect(deriveClaimStatus(claimed, beneficiary.address)).toBe("claimed");

    const expired = makeVault({
      activatedAt: DAY,
      beneficiaries: [beneficiary],
      claims: [{ beneficiaryId: beneficiary.id, address: beneficiary.address, status: "expired" }],
    });
    expect(deriveClaimStatus(expired, beneficiary.address)).toBe("expired");
  });

  it("makes claims available once the vault is triggered", () => {
    const vault = makeVault({ activatedAt: DAY, beneficiaries: [beneficiary], claims: [] });
    expect(deriveClaimStatus(vault, beneficiary.address)).toBe("available");
  });

  it("is not eligible for draft or cancelled vaults", () => {
    expect(deriveClaimStatus(makeVault({ status: "draft" }), beneficiary.address, new Date(DAY))).toBe(
      "not-eligible",
    );
    expect(
      deriveClaimStatus(makeVault({ status: "cancelled" }), beneficiary.address, new Date(DAY)),
    ).toBe("not-eligible");
  });

  it("is pending while a missed check-in is in its grace period", () => {
    const vault = makeVault({ beneficiaries: [beneficiary], claims: [] });
    expect(deriveClaimStatus(vault, beneficiary.address, new Date("2026-04-15"))).toBe("pending");
  });

  it("is pending while guardian approvals are outstanding", () => {
    const g1 = makeGuardian({ id: "g1", address: testAddress(3), approvalStatus: "approved" });
    const g2 = makeGuardian({ id: "g2", address: testAddress(4), approvalStatus: "pending" });
    const vault = makeVault({
      beneficiaries: [beneficiary],
      claims: [],
      guardians: [g1, g2],
      activation: makeActivation({ trigger: "guardian-approval", guardianThreshold: 2 }),
      activationApprovals: [g1.address],
    });
    expect(deriveClaimStatus(vault, beneficiary.address, new Date("2026-02-01"))).toBe("pending");
  });

  it("is not eligible for an address that is not a beneficiary", () => {
    const vault = makeVault({ beneficiaries: [beneficiary], claims: [] });
    expect(deriveClaimStatus(vault, testAddress(99), new Date("2026-04-15"))).toBe("not-eligible");
  });
});

describe("findClaim and aggregate helpers", () => {
  it("finds a claim by beneficiary address", () => {
    const claim = { beneficiaryId: "b1", address: testAddress(2), status: "available" as const };
    const vault = makeVault({ claims: [claim] });
    expect(findClaim(vault, claim.address)).toEqual(claim);
    expect(findClaim(vault, testAddress(50))).toBeUndefined();
  });

  it("sums protected assets and ignores draft/cancelled vaults", () => {
    const vaults = [
      makeVault({ asset: { contractId: makeVault().asset.contractId, symbol: "USDC", decimals: 7, amount: "100" } }),
      makeVault({ status: "draft", asset: { contractId: makeVault().asset.contractId, symbol: "USDC", decimals: 7, amount: "50" } }),
      makeVault({ status: "cancelled", asset: { contractId: makeVault().asset.contractId, symbol: "USDC", decimals: 7, amount: "25" } }),
    ];
    expect(aggregateProtectedAssets(vaults)).toBe(100);
  });

  it("counts beneficiaries", () => {
    expect(countBeneficiaries(makeVault({ beneficiaries: [makeBeneficiary(), makeBeneficiary({ id: "b2", address: testAddress(8) })] }))).toBe(2);
  });
});
