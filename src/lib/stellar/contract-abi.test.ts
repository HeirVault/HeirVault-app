/**
 * Contract ABI conformance tests.
 *
 * These are the integration tests between the frontend's transaction builders
 * and the deployed HeirVault contract. They decode the XDR each builder emits
 * and assert, entrypoint by entrypoint, that:
 *
 *  - the function name matches the `#[contractimpl]` block in
 *    `contracts/heirvault/src/lib.rs`;
 *  - the argument order matches the Rust signature;
 *  - every argument carries the right ScVal type — in particular that vault ids
 *    are `u64` (the original integration sent them as strings) and amounts are
 *    `i128` base units;
 *  - no entrypoint that the contract does not implement is ever built.
 *
 * Set `HEIRVAULT_LIVE_TEST=1` (with `NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID` pointing
 * at a deployed contract) to additionally exercise the read entrypoints against
 * the real Soroban RPC. That suite is skipped by default so `npm test` never
 * depends on the network.
 */

import { Address, scValToNative, xdr } from "@stellar/stellar-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { testAddress, testContractId } from "@/lib/vault/test-factories";

import {
  HEIRVAULT_METHODS,
  buildActivateVaultOp,
  buildAddBeneficiaryOp,
  buildAddGuardianOp,
  buildCancelVaultOp,
  buildCheckInOp,
  buildClaimOp,
  buildCreateVaultOp,
  buildDepositOp,
  buildGuardianApproveOp,
  buildRemoveBeneficiaryOp,
  buildRemoveGuardianOp,
  buildSetGuardianThresholdOp,
  buildUpdateBeneficiaryOp,
  buildWithdrawOp,
  ContractNotConfiguredError,
  readSchemaVersion,
  readVaultCount,
} from "./contract";

/** Entrypoints exported by `contracts/heirvault/src/lib.rs` (contract v0.1.0). */
const CONTRACT_ENTRYPOINTS = [
  "create_vault",
  "deposit",
  "add_beneficiary",
  "remove_beneficiary",
  "update_beneficiary",
  "get_beneficiaries",
  "get_active_beneficiaries",
  "get_total_allocation",
  "add_guardian",
  "remove_guardian",
  "set_guardian_threshold",
  "guardian_approve",
  "get_guardians",
  "get_guardian_status",
  "check_in",
  "activate_vault",
  "cancel_vault",
  "withdraw",
  "claim",
  "get_claims",
  "get_claim",
  "get_undistributed_balance",
  "get_vault",
  "get_vault_status",
  "get_deadlines",
  "is_claimable",
  "get_vaults_by_owner",
  "get_vault_count",
  "get_vaults_by_beneficiary",
  "schema_version",
] as const;

/** Entrypoints the frontend used to invent, which the contract never had. */
const INVENTED_ENTRYPOINTS = [
  "list_vaults_by_owner",
  "update_beneficiaries",
  "update_guardians",
  "approve_activation",
  "trigger_activation",
  "get_claim_status",
  "get_transactions",
] as const;

const OWNER = testAddress(1);
const BENEFICIARY = testAddress(2);
const GUARDIAN = testAddress(3);
const ASSET = testContractId(7);
const VAULT_ID = "42";

interface DecodedCall {
  contractId: string;
  method: string;
  types: string[];
  values: unknown[];
}

/** Decode an `InvokeHostFunction` operation back into its contract call. */
function decodeCall(operation: xdr.Operation): DecodedCall {
  const body = operation.body();
  expect(body.switch().name).toBe("invokeHostFunction");

  const hostFunction = body.invokeHostFunctionOp().hostFunction();
  expect(hostFunction.switch().name).toBe("hostFunctionTypeInvokeContract");

  const call = hostFunction.invokeContract();
  return {
    contractId: Address.fromScAddress(call.contractAddress()).toString(),
    method: call.functionName().toString(),
    types: call.args().map((arg) => arg.switch().name),
    values: call.args().map((arg) => scValToNative(arg)),
  };
}

describe("entrypoint names", () => {
  it("declares exactly the entrypoints the contract implements", () => {
    expect([...Object.values(HEIRVAULT_METHODS)].sort()).toEqual([...CONTRACT_ENTRYPOINTS].sort());
  });

  it("never declares an entrypoint the contract does not implement", () => {
    const declared = new Set<string>(Object.values(HEIRVAULT_METHODS));
    for (const name of INVENTED_ENTRYPOINTS) {
      expect(declared.has(name)).toBe(false);
    }
  });

  it("throws before any network call when no contract id is configured", () => {
    const previous = process.env.NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID;
    delete process.env.NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID;
    try {
      expect(() =>
        buildCheckInOp({ vaultId: VAULT_ID }),
      ).toThrow(ContractNotConfiguredError);
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID;
      else process.env.NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID = previous;
    }
  });
});

describe("operation builders", () => {
  let contractId: string;
  let previousContractId: string | undefined;

  beforeAll(() => {
    contractId = testContractId(9);
    previousContractId = process.env.NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID;
    process.env.NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID = contractId;
  });

  afterAll(() => {
    // Restore whatever the environment had, so the gated live-read suite that
    // runs afterwards still sees the real deployment.
    if (previousContractId === undefined) {
      delete process.env.NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID;
    } else {
      process.env.NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID = previousContractId;
    }
  });

  it("create_vault(owner, asset, activation_mode, check_in_period, grace_period) -> u64", () => {
    const call = decodeCall(
      buildCreateVaultOp({
        owner: OWNER,
        assetContractId: ASSET,
        activationMode: "MissedCheckIn",
        checkInPeriodSeconds: 7_776_000,
        gracePeriodSeconds: 2_592_000,
      }),
    );

    expect(call.contractId).toBe(contractId);
    expect(call.method).toBe("create_vault");
    // Soroban encodes the `ActivationMode` enum as ScVec[Symbol].
    expect(call.types).toEqual([
      "scvAddress",
      "scvAddress",
      "scvVec",
      "scvU64",
      "scvU64",
    ]);
    expect(call.values).toEqual([OWNER, ASSET, ["MissedCheckIn"], 7_776_000n, 2_592_000n]);
  });

  it("encodes every vault id as u64, never as a string", () => {
    const withVaultId = [
      buildDepositOp({ vaultId: VAULT_ID, assetContractId: ASSET, amount: 1n }),
      buildAddBeneficiaryOp({ vaultId: VAULT_ID, beneficiaryAddress: BENEFICIARY, allocationBps: 5_000 }),
      buildRemoveBeneficiaryOp({ vaultId: VAULT_ID, beneficiaryAddress: BENEFICIARY }),
      buildUpdateBeneficiaryOp({ vaultId: VAULT_ID, beneficiaryAddress: BENEFICIARY, newAllocationBps: 2_500 }),
      buildAddGuardianOp({ vaultId: VAULT_ID, guardianAddress: GUARDIAN }),
      buildRemoveGuardianOp({ vaultId: VAULT_ID, guardianAddress: GUARDIAN }),
      buildSetGuardianThresholdOp({ vaultId: VAULT_ID, threshold: 1 }),
      buildGuardianApproveOp({ vaultId: VAULT_ID, guardianAddress: GUARDIAN }),
      buildCheckInOp({ vaultId: VAULT_ID }),
      buildActivateVaultOp({ vaultId: VAULT_ID }),
      buildCancelVaultOp({ vaultId: VAULT_ID }),
      buildWithdrawOp({ vaultId: VAULT_ID, amount: 1n }),
      buildClaimOp({ vaultId: VAULT_ID, beneficiaryAddress: BENEFICIARY }),
    ];

    for (const operation of withVaultId) {
      const call = decodeCall(operation);
      expect(call.types[0]).toBe("scvU64");
      expect(call.values[0]).toBe(42n);
    }
  });

  it("rejects a vault id that is not a decimal number", () => {
    expect(() => buildCheckInOp({ vaultId: "vault_abc" })).toThrow(/non-negative integer vault id/);
    expect(() => buildCheckInOp({ vaultId: "-1" })).toThrow(/non-negative integer vault id/);
  });

  it("deposit(vault_id, asset, amount) with an i128 amount", () => {
    const call = decodeCall(
      buildDepositOp({
        vaultId: VAULT_ID,
        assetContractId: ASSET,
        amount: 25_000_0000_000n,
      }),
    );

    expect(call.method).toBe("deposit");
    expect(call.types).toEqual(["scvU64", "scvAddress", "scvI128"]);
    expect(call.values).toEqual([42n, ASSET, 25_000_0000_000n]);
  });

  it("add_beneficiary(vault_id, beneficiary, allocation_bps u32)", () => {
    const call = decodeCall(
      buildAddBeneficiaryOp({
        vaultId: VAULT_ID,
        beneficiaryAddress: BENEFICIARY,
        allocationBps: 6_000,
      }),
    );

    expect(call.method).toBe("add_beneficiary");
    expect(call.types).toEqual(["scvU64", "scvAddress", "scvU32"]);
    expect(call.values).toEqual([42n, BENEFICIARY, 6_000]);
  });

  it("update_beneficiary(vault_id, beneficiary, new_allocation_bps u32)", () => {
    const call = decodeCall(
      buildUpdateBeneficiaryOp({
        vaultId: VAULT_ID,
        beneficiaryAddress: BENEFICIARY,
        newAllocationBps: 4_000,
      }),
    );

    expect(call.method).toBe("update_beneficiary");
    expect(call.types).toEqual(["scvU64", "scvAddress", "scvU32"]);
    expect(call.values).toEqual([42n, BENEFICIARY, 4_000]);
  });

  it("remove_beneficiary(vault_id, beneficiary) takes no owner argument", () => {
    const call = decodeCall(
      buildRemoveBeneficiaryOp({ vaultId: VAULT_ID, beneficiaryAddress: BENEFICIARY }),
    );

    expect(call.method).toBe("remove_beneficiary");
    expect(call.types).toEqual(["scvU64", "scvAddress"]);
    expect(call.values).toEqual([42n, BENEFICIARY]);
  });

  it("guardian entrypoints match the contract signatures", () => {
    const add = decodeCall(buildAddGuardianOp({ vaultId: VAULT_ID, guardianAddress: GUARDIAN }));
    expect(add.method).toBe("add_guardian");
    expect(add.values).toEqual([42n, GUARDIAN]);

    const remove = decodeCall(
      buildRemoveGuardianOp({ vaultId: VAULT_ID, guardianAddress: GUARDIAN }),
    );
    expect(remove.method).toBe("remove_guardian");
    expect(remove.types).toEqual(["scvU64", "scvAddress"]);

    const threshold = decodeCall(buildSetGuardianThresholdOp({ vaultId: VAULT_ID, threshold: 2 }));
    expect(threshold.method).toBe("set_guardian_threshold");
    expect(threshold.types).toEqual(["scvU64", "scvU32"]);
    expect(threshold.values).toEqual([42n, 2]);

    // The contract exposes `guardian_approve`, not `approve_activation`.
    const approve = decodeCall(
      buildGuardianApproveOp({ vaultId: VAULT_ID, guardianAddress: GUARDIAN }),
    );
    expect(approve.method).toBe("guardian_approve");
    expect(approve.values).toEqual([42n, GUARDIAN]);
  });

  it("check_in(vault_id) takes the id alone — the owner authenticates the tx", () => {
    const call = decodeCall(buildCheckInOp({ vaultId: VAULT_ID }));
    expect(call.method).toBe("check_in");
    expect(call.types).toEqual(["scvU64"]);
    expect(call.values).toEqual([42n]);
  });

  it("activate_vault(vault_id) is permissionless and takes no caller", () => {
    const call = decodeCall(buildActivateVaultOp({ vaultId: VAULT_ID }));
    expect(call.method).toBe("activate_vault");
    expect(call.types).toEqual(["scvU64"]);
  });

  it("cancel_vault(vault_id) takes no owner argument", () => {
    const call = decodeCall(buildCancelVaultOp({ vaultId: VAULT_ID }));
    expect(call.method).toBe("cancel_vault");
    expect(call.types).toEqual(["scvU64"]);
  });

  it("withdraw(vault_id, amount i128)", () => {
    const call = decodeCall(buildWithdrawOp({ vaultId: VAULT_ID, amount: 500n }));
    expect(call.method).toBe("withdraw");
    expect(call.types).toEqual(["scvU64", "scvI128"]);
    expect(call.values).toEqual([42n, 500n]);
  });

  it("claim(vault_id, beneficiary) returns i128 and authenticates the beneficiary", () => {
    const call = decodeCall(
      buildClaimOp({ vaultId: VAULT_ID, beneficiaryAddress: BENEFICIARY }),
    );
    expect(call.method).toBe("claim");
    expect(call.types).toEqual(["scvU64", "scvAddress"]);
    expect(call.values).toEqual([42n, BENEFICIARY]);
  });

  it("encodes activation modes exactly as the Rust enum spells them", () => {
    for (const mode of ["MissedCheckIn", "GuardianApproval", "MultiCondition"] as const) {
      const call = decodeCall(
        buildCreateVaultOp({
          owner: OWNER,
          assetContractId: ASSET,
          activationMode: mode,
          checkInPeriodSeconds: 86_400,
          gracePeriodSeconds: 86_400,
        }),
      );
      expect(call.values[2]).toEqual([mode]);
      expect(call.types[2]).toBe("scvVec");
    }
  });

  it("round-trips through XDR without changing the call", () => {
    const operation = buildDepositOp({ vaultId: VAULT_ID, assetContractId: ASSET, amount: 1n });
    const restored = xdr.Operation.fromXDR(operation.toXDR());
    const call = decodeCall(restored);

    expect(call.method).toBe("deposit");
    expect(call.values).toEqual([42n, ASSET, 1n]);
  });
});

const live = describe.runIf(
  process.env.HEIRVAULT_LIVE_TEST === "1" && !!process.env.NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID,
);

live("live Testnet reads", () => {
  it("reads the deployed contract's vault count and schema version", async () => {
    const [count, schema] = await Promise.all([readVaultCount(), readSchemaVersion()]);

    expect(Number.isInteger(count)).toBe(true);
    expect(count).toBeGreaterThanOrEqual(0);
    expect(schema).toBe(1);
  });

  it.runIf(!!process.env.HEIRVAULT_LIVE_OWNER)(
    "decodes a real get_vaults_by_owner page",
    async () => {
    const owner = process.env.HEIRVAULT_LIVE_OWNER as string;

    const { readVaultsByOwner } = await import("./contract");
    const page = await readVaultsByOwner(owner, { limit: 5 });

    expect(page.meta.total).toBeGreaterThanOrEqual(0);
    expect(page.items.length).toBeLessThanOrEqual(5);
    for (const item of page.items) {
      expect(item.owner).toBe(owner);
      expect(item.id).toMatch(/^\d+$/);
    }
    },
  );
});
