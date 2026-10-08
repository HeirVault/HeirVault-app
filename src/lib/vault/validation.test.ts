/**
 * Unit tests for the vault validation rules.
 *
 * These rules mirror the contract's invariants (especially the 100% allocation
 * rule). The tests assert both the pass/fail outcome and the field path each
 * issue is attached to, because the wizard gates navigation on those paths.
 */

import { describe, expect, it } from "vitest";

import { TOTAL_ALLOCATION_BPS } from "./types";
import {
  allocationFromPercentInput,
  autoBalanceBeneficiaries,
  evenAllocationBps,
  isValidContractId,
  isValidStellarAddress,
  stepForField,
  validateActivation,
  validateAmount,
  validateBeneficiaries,
  validateDraft,
  validateGuardians,
  validateStep,
  validateVaultInfo,
} from "./validation";
import { makeBeneficiary, makeDraft, makeGuardian, testAddress, testContractId } from "./test-factories";

describe("isValidStellarAddress / isValidContractId", () => {
  it("accepts the right strkey kinds and rejects the others", () => {
    expect(isValidStellarAddress(testAddress(1))).toBe(true);
    expect(isValidStellarAddress(testContractId(1))).toBe(false);
    expect(isValidContractId(testContractId(1))).toBe(true);
    expect(isValidContractId(testAddress(1))).toBe(false);
    expect(isValidStellarAddress("")).toBe(false);
    expect(isValidContractId("")).toBe(false);
  });
});

describe("validateAmount", () => {
  it("requires a value", () => {
    const result = validateAmount("", 7);
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toEqual({ field: "amount", message: "Enter an amount." });
  });

  it("rejects non-numeric and bare-dot input", () => {
    expect(validateAmount("abc", 7).issues[0].message).toBe("Enter a valid number.");
    expect(validateAmount(".", 7).issues[0].message).toBe("Enter a valid number.");
  });

  it("enforces the asset precision", () => {
    const result = validateAmount("1.12345678", 7);
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toMatch(/at most 7 decimals/);
  });

  it("requires a positive amount by default", () => {
    expect(validateAmount("0", 7).issues[0].message).toBe("Amount must be greater than zero.");
  });

  it("allows zero when positivity is not required", () => {
    expect(validateAmount("0", 7, { requirePositive: false }).valid).toBe(true);
  });

  it("checks the available balance", () => {
    const result = validateAmount("5", 7, { available: "3" });
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toMatch(/exceeds the available balance/);
    expect(validateAmount("3", 7, { available: "3" }).valid).toBe(true);
  });

  it("uses the provided field path", () => {
    expect(validateAmount("", 7, { field: "asset.amount" }).issues[0].field).toBe("asset.amount");
  });

  it("accepts a valid amount", () => {
    expect(validateAmount("12.5", 7).valid).toBe(true);
  });
});

describe("validateBeneficiaries", () => {
  it("requires at least one beneficiary", () => {
    const result = validateBeneficiaries([]);
    expect(result.valid).toBe(false);
    expect(result.issues[0].field).toBe("beneficiaries");
  });

  it("accepts a set that totals exactly 100%", () => {
    const result = validateBeneficiaries([
      makeBeneficiary({ id: "b1", address: testAddress(2), allocationBps: 6_000 }),
      makeBeneficiary({ id: "b2", address: testAddress(3), allocationBps: 4_000 }),
    ]);
    expect(result.valid).toBe(true);
  });

  it("reports the unallocated remainder on the total path", () => {
    const result = validateBeneficiaries([makeBeneficiary({ allocationBps: 3_000 })]);
    expect(result.valid).toBe(false);
    expect(result.issues[0].field).toBe("beneficiaries.total");
    expect(result.issues[0].message).toMatch(/70%/);
  });

  it("reports an over-allocation with the reduction required", () => {
    const result = validateBeneficiaries([
      makeBeneficiary({ id: "b1", address: testAddress(2), allocationBps: 6_000 }),
      makeBeneficiary({ id: "b2", address: testAddress(3), allocationBps: 6_000 }),
    ]);
    expect(result.issues[0].field).toBe("beneficiaries.total");
    expect(result.issues[0].message).toMatch(/120%/);
  });

  it("rejects an invalid address", () => {
    const result = validateBeneficiaries([makeBeneficiary({ address: "not-an-address" })]);
    expect(result.issues.some((issue) => issue.field === "beneficiaries.0.address")).toBe(true);
  });

  it("rejects duplicate addresses case-insensitively", () => {
    const address = testAddress(2);
    const result = validateBeneficiaries([
      makeBeneficiary({ id: "b1", address, allocationBps: 5_000 }),
      makeBeneficiary({ id: "b2", address: address.toLowerCase(), allocationBps: 5_000 }),
    ]);
    expect(result.issues.some((issue) => issue.message === "This address is already a beneficiary.")).toBe(true);
  });

  it("rejects zero and oversized allocations", () => {
    expect(
      validateBeneficiaries([makeBeneficiary({ allocationBps: 0 })]).issues.some((issue) =>
        issue.message.includes("greater than 0%"),
      ),
    ).toBe(true);
    expect(
      validateBeneficiaries([makeBeneficiary({ allocationBps: TOTAL_ALLOCATION_BPS + 1 })]).issues.some((issue) =>
        issue.message.includes("cannot exceed 100%"),
      ),
    ).toBe(true);
  });

  it("enforces the maximum number of beneficiaries", () => {
    const many = Array.from({ length: 21 }, (_, index) =>
      makeBeneficiary({ id: `b${index}`, address: testAddress(index + 10), allocationBps: 476 }),
    );
    expect(validateBeneficiaries(many).issues.some((issue) => issue.message.includes("at most 20"))).toBe(true);
  });
});

describe("allocation helpers", () => {
  it("splits evenly and always totals 100%", () => {
    expect(evenAllocationBps(0)).toEqual([]);
    expect(evenAllocationBps(1)).toEqual([10_000]);
    expect(evenAllocationBps(2)).toEqual([5_000, 5_000]);
    expect(evenAllocationBps(3)).toEqual([3_334, 3_333, 3_333]);

    for (let count = 1; count <= 20; count += 1) {
      const allocations = evenAllocationBps(count);
      expect(allocations.reduce((sum, value) => sum + value, 0)).toBe(10_000);
    }
  });

  it("rebalances beneficiaries without dropping fields", () => {
    const input = [
      makeBeneficiary({ id: "b1", address: testAddress(2), label: "One", allocationBps: 9_000 }),
      makeBeneficiary({ id: "b2", address: testAddress(3), label: "Two", allocationBps: 1_000 }),
    ];
    const balanced = autoBalanceBeneficiaries(input);
    expect(balanced.map((b) => b.allocationBps)).toEqual([5_000, 5_000]);
    expect(balanced.map((b) => b.label)).toEqual(["One", "Two"]);
  });

  it("clamps percentage input to the valid range", () => {
    expect(allocationFromPercentInput(Number.NaN)).toBe(0);
    expect(allocationFromPercentInput(-5)).toBe(0);
    expect(allocationFromPercentInput(200)).toBe(10_000);
    expect(allocationFromPercentInput(33.33)).toBe(3_333);
  });
});

describe("validateGuardians", () => {
  it("accepts a valid guardian set", () => {
    expect(validateGuardians([makeGuardian({ address: testAddress(3) })], 1).valid).toBe(true);
  });

  it("rejects invalid and duplicate addresses", () => {
    const withBad = validateGuardians([makeGuardian({ address: "nope" })], 1);
    expect(withBad.issues.some((issue) => issue.field === "guardians.0.address")).toBe(true);

    const duplicate = validateGuardians(
      [
        makeGuardian({ id: "g1", address: testAddress(3) }),
        makeGuardian({ id: "g2", address: testAddress(3) }),
      ],
      1,
    );
    expect(duplicate.issues.some((issue) => issue.message === "This address is already a guardian.")).toBe(true);
  });

  it("bounds the threshold by the guardian count", () => {
    expect(
      validateGuardians([makeGuardian()], 0).issues.some((issue) => issue.message === "Threshold must be at least 1."),
    ).toBe(true);
    expect(
      validateGuardians([makeGuardian({ address: testAddress(3) })], 2).issues.some((issue) =>
        issue.message.includes("cannot exceed the number of guardians (1)"),
      ),
    ).toBe(true);
  });

  it("enforces the maximum number of guardians", () => {
    const many = Array.from({ length: 11 }, (_, index) =>
      makeGuardian({ id: `g${index}`, address: testAddress(index + 20) }),
    );
    expect(validateGuardians(many, 1).issues.some((issue) => issue.message.includes("at most 10"))).toBe(true);
  });
});

describe("validateVaultInfo", () => {
  it("requires a name of a sensible length", () => {
    expect(validateVaultInfo({ name: "" }).issues[0].message).toBe("Give the vault a name.");
    expect(validateVaultInfo({ name: "ab" }).issues[0].message).toBe("Use at least 3 characters.");
    expect(validateVaultInfo({ name: "x".repeat(61) }).issues[0].message).toBe("Use at most 60 characters.");
    expect(validateVaultInfo({ name: "Family Reserve" }).valid).toBe(true);
  });

  it("bounds the description length", () => {
    expect(validateVaultInfo({ name: "Valid", description: "x".repeat(281) }).valid).toBe(false);
  });
});

describe("validateActivation", () => {
  const context = { guardians: [] as ReturnType<typeof makeGuardian>[], hasBeneficiaries: true };

  it("accepts the default policy", () => {
    expect(validateActivation(makeDraft().activation, context).valid).toBe(true);
  });

  it("bounds the check-in interval", () => {
    expect(
      validateActivation({ ...makeDraft().activation, checkInIntervalDays: 0 }, context).issues.some((issue) =>
        issue.field === "activation.checkInIntervalDays",
      ),
    ).toBe(true);
    expect(
      validateActivation({ ...makeDraft().activation, checkInIntervalDays: 366 }, context).valid,
    ).toBe(false);
  });

  it("bounds the grace period including zero", () => {
    expect(validateActivation({ ...makeDraft().activation, gracePeriodDays: 0 }, context).valid).toBe(true);
    expect(validateActivation({ ...makeDraft().activation, gracePeriodDays: -1 }, context).valid).toBe(false);
    expect(validateActivation({ ...makeDraft().activation, gracePeriodDays: 366 }, context).valid).toBe(false);
  });

  it("requires a future activation date for scheduled vaults", () => {
    const base = { ...makeDraft().activation, trigger: "scheduled" as const };
    expect(validateActivation(base, context).issues.some((issue) => issue.field === "activation.scheduledActivationAt")).toBe(true);
    expect(validateActivation({ ...base, scheduledActivationAt: "2020-01-01T00:00:00.000Z" }, context).issues.some((issue) => issue.message.includes("future"))).toBe(true);
    expect(validateActivation({ ...base, scheduledActivationAt: "2999-01-01T00:00:00.000Z" }, context).valid).toBe(true);
  });

  it("requires guardians for guardian-approval activation", () => {
    const activation = { ...makeDraft().activation, trigger: "guardian-approval" as const };
    expect(validateActivation(activation, context).issues.some((issue) => issue.field === "guardians")).toBe(true);
    expect(
      validateActivation(activation, { guardians: [makeGuardian({ address: testAddress(3) })], hasBeneficiaries: true }).valid,
    ).toBe(true);
  });

  it("requires emergency activation for manual activation", () => {
    const activation = { ...makeDraft().activation, trigger: "manual" as const };
    expect(
      validateActivation(activation, context).issues.some((issue) =>
        issue.field === "activation.emergencyActivationEnabled",
      ),
    ).toBe(true);
    expect(validateActivation({ ...activation, emergencyActivationEnabled: true }, context).valid).toBe(true);
  });

  it("requires beneficiaries", () => {
    expect(
      validateActivation(makeDraft().activation, { guardians: [], hasBeneficiaries: false }).issues.some((issue) =>
        issue.field === "beneficiaries",
      ),
    ).toBe(true);
  });
});

describe("validateDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateDraft(makeDraft()).valid).toBe(true);
  });

  it("collects issues across sections", () => {
    const draft = makeDraft({
      name: "",
      asset: { contractId: "bad", symbol: "USDC", decimals: 7, amount: "0" },
    });
    const fields = validateDraft(draft).issues.map((issue) => issue.field);
    expect(fields).toContain("name");
    expect(fields).toContain("asset.amount");
    expect(fields).toContain("asset.contractId");
  });
});

describe("stepForField", () => {
  it("maps issue paths to wizard steps", () => {
    expect(stepForField("name")).toBe("info");
    expect(stepForField("asset.amount")).toBe("asset");
    expect(stepForField("amount")).toBe("asset");
    expect(stepForField("beneficiaries.0.address")).toBe("beneficiaries");
    expect(stepForField("beneficiaries.total")).toBe("distribution");
    expect(stepForField("guardians.0.address")).toBe("guardians");
    expect(stepForField("activation.gracePeriodDays")).toBe("activation");
  });
});

describe("validateStep", () => {
  it("only surfaces issues belonging to the requested step", () => {
    const draft = makeDraft({ name: "" });
    expect(validateStep("info", draft).valid).toBe(false);
    expect(validateStep("asset", draft).valid).toBe(true);
  });
});

