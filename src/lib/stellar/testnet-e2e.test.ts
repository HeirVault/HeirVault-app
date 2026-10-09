/**
 * Real Stellar Testnet end-to-end test.
 *
 * This exercises the *frontend's own* code path — the operation builders in
 * `contract.ts`, the simulation in `transactions.ts`, submission and
 * confirmation — against a deployed HeirVault contract, for the whole vault
 * lifecycle:
 *
 *   create_vault → returned vault id → check_in → add_beneficiary →
 *   add_guardian + set_guardian_threshold → deposit → (grace period lapses) →
 *   guardian_approve → activate_vault → claim
 *
 * It also asserts a negative case: activation must be refused while the
 * guardian threshold is not met.
 *
 * The only substitution from the browser is the signer: this environment has
 * no browser extension, so the XDR produced by the app is signed with a local
 * Testnet key through the Stellar CLI instead of Freighter. The envelope that
 * is simulated, signed and submitted is byte-for-byte what the app hands to
 * Freighter.
 *
 * It never runs as part of `npm test`. To run it:
 *
 *   HEIRVAULT_E2E=1 \
 *   NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID=C... \
 *   NEXT_PUBLIC_USDC_CONTRACT_ID=C... \
 *   npx vitest run src/lib/stellar/testnet-e2e.test.ts
 *
 * The signing identities are read from the local Stellar CLI keystore
 * (`~/.config/stellar/identity`); secrets never leave that directory and are
 * never printed.
 */

import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import { TransactionBuilder } from "@stellar/stellar-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildActivateVaultOp,
  buildAddBeneficiaryOp,
  buildAddGuardianOp,
  buildCheckInOp,
  buildClaimOp,
  buildCreateVaultOp,
  buildDepositOp,
  buildGuardianApproveOp,
  buildSetGuardianThresholdOp,
  readDeadlines,
  readDomainVault,
  readSchemaVersion,
  readVaultCount,
  readVaultIdFromReturnValue,
  readVaultsByOwner,
} from "./contract";
import {
  buildTransaction,
  prepareTransaction,
  submitSignedTransaction,
  TransactionFailedError,
  type SubmitResult,
} from "./transactions";

const enabled = process.env.HEIRVAULT_E2E === "1";
const suite = describe.runIf(enabled);

const OWNER_KEY = "hv-admin";
const BENEFICIARY_KEY = "hv-heir-a";
const GUARDIAN_KEY = "hv-heir-b";

const OWNER = "GBMXSZJTOQY3VLBLR3G3ZIGQW2F6PFBBM5D3WKGOJPKX56MX2C3QHOHJ";
const BENEFICIARY = "GDAZ22CFUEIMUOMU4DPY66S5QO3T64LMF2DV6AOZW7YA7O2L2OJQBPQG";
const GUARDIAN = "GBWCXOVQZBVB4VBXXQIC422L2EKZCVDO34FP3EJLBOKPMV2UZTAX5WCE";

/** Log of everything that really happened, printed at the end of the run. */
const transcript: string[] = [];
function record(line: string): void {
  transcript.push(line);
  console.log(`[e2e] ${line}`);
}

function keyFile(name: string): string {
  return join(homedir(), ".config", "stellar", "identity", `${name}.toml`);
}

/** Sign an envelope with a local CLI identity (the Freighter stand-in). */
function signWith(identity: string, envelopeXdr: string): string {
  const output = execFileSync(
    "stellar",
    ["tx", "sign", "--sign-with-key", identity, "--network", "testnet"],
    {
      input: envelopeXdr,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${join(homedir(), ".local", "bin")}:${process.env.PATH ?? ""}`,
      },
      maxBuffer: 8 * 1024 * 1024,
    },
  ).trim();

  // `tx sign` writes the signed envelope to stdout; be defensive about any
  // decorative output by taking the last parseable envelope.
  const candidates = output.split(/\s+/).filter((chunk) => chunk.length > 100);
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      TransactionBuilder.fromXDR(candidates[index], "Test SDF Network ; September 2015");
      return candidates[index];
    } catch {
      // try the previous chunk
    }
  }
  throw new Error(`Could not parse a signed envelope for identity ${identity}.`);
}

/** Build → simulate → sign → submit → confirm, using the app's own pipeline. */
async function run(
  identity: string,
  operations: Parameters<typeof buildTransaction>[0]["operations"],
  label: string,
): Promise<SubmitResult> {
  const built = await buildTransaction({ sourceAddress: ownerAddress(identity), operations });
  const prepared = await prepareTransaction(built);
  const signed = signWith(identity, prepared.transaction.toXDR());
  const result = await submitSignedTransaction(signed);

  if (result.status !== "success") {
    throw new Error(`${label}: transaction not confirmed (${result.status}) ${result.error ?? ""}`);
  }
  record(`${label}: ${result.hash} (ledger ${result.ledger ?? "?"})`);
  return result;
}

function ownerAddress(identity: string): string {
  return identity === OWNER_KEY ? OWNER : identity === BENEFICIARY_KEY ? BENEFICIARY : GUARDIAN;
}

async function expectRejection(
  identity: string,
  operations: Parameters<typeof buildTransaction>[0]["operations"],
  label: string,
): Promise<string> {
  try {
    const built = await buildTransaction({ sourceAddress: ownerAddress(identity), operations });
    await prepareTransaction(built);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(`${label}: refused as expected — ${message}`);
    expect(error).toBeInstanceOf(TransactionFailedError);
    return message;
  }
  throw new Error(`${label}: expected the contract to refuse this call, but it simulated cleanly.`);
}

const CHECK_IN_SECONDS = 60;
const GRACE_SECONDS = 60;
const DEPOSIT_AMOUNT = 1_000_000_000n; // 100 HVE2E @ 7 decimals

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

suite("Stellar Testnet end-to-end", () => {
  let contractId: string;
  let assetId: string;
  let vaultId: string;

  beforeAll(() => {
    contractId = process.env.NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID ?? "";
    assetId = process.env.NEXT_PUBLIC_USDC_CONTRACT_ID ?? "";
    if (!contractId || !assetId) {
      throw new Error(
        "HEIRVAULT_E2E=1 requires NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID and NEXT_PUBLIC_USDC_CONTRACT_ID.",
      );
    }
    process.env.NEXT_PUBLIC_USDC_SYMBOL = process.env.NEXT_PUBLIC_USDC_SYMBOL || "HVE2E";
    process.env.NEXT_PUBLIC_USDC_DECIMALS = process.env.NEXT_PUBLIC_USDC_DECIMALS || "7";

    // Fail fast if the local keystore is not available.
    for (const identity of [OWNER_KEY, BENEFICIARY_KEY, GUARDIAN_KEY]) {
      execFileSync("test", ["-f", keyFile(identity)]);
    }
  }, 60_000);

  afterAll(() => {
    console.log(`\n[e2e] transcript (${transcript.length} events)`)
    transcript.forEach((line) => console.log(`[e2e]   ${line}`));
  });

  it(
    "reads the deployed contract, then runs the full vault lifecycle",
    async () => {
      // ── 1. Reads ────────────────────────────────────────────────────────
      const [count, schema] = await Promise.all([readVaultCount(), readSchemaVersion()]);
      expect(Number.isInteger(count)).toBe(true);
      expect(schema).toBe(1);
      record(`read: get_vault_count=${count}, schema_version=${schema}`);

      const before = await readVaultsByOwner(OWNER, { limit: 25 });
      record(`read: get_vaults_by_owner(${OWNER}) → ${before.items.length} vault(s)`);
      expect(before.meta.total).toBe(before.items.length);

      // ── 2. create_vault → read the returned numeric id ──────────────────
      const created = await run(
        OWNER_KEY,
        [
          buildCreateVaultOp({
            owner: OWNER,
            assetContractId: assetId,
            activationMode: "MultiCondition",
            checkInPeriodSeconds: CHECK_IN_SECONDS,
            gracePeriodSeconds: GRACE_SECONDS,
          }),
        ],
        "create_vault(MultiCondition, 60s, 60s)",
      );

      vaultId = readVaultIdFromReturnValue(created.returnValue);
      expect(vaultId).toMatch(/^\d+$/);
      record(`create_vault returned vault id=${vaultId}`);

      // ── 3. check_in must land before the grace period closes ────────────
      await run(OWNER_KEY, [buildCheckInOp({ vaultId })], `check_in(${vaultId})`);

      // ── 4. Beneficiaries (100% in one slot) ─────────────────────────────
      await run(
        OWNER_KEY,
        [
          buildAddBeneficiaryOp({
            vaultId,
            beneficiaryAddress: BENEFICIARY,
            allocationBps: 10_000,
          }),
        ],
        `add_beneficiary(${vaultId}, heir, 10000)`,
      );

      // ── 5. Guardian + threshold in a single transaction ─────────────────
      await run(
        OWNER_KEY,
        [
          buildAddGuardianOp({ vaultId, guardianAddress: GUARDIAN }),
          buildSetGuardianThresholdOp({ vaultId, threshold: 1 }),
        ],
        `add_guardian(${vaultId}) + set_guardian_threshold(1)`,
      );

      // ── 6. Deposit ──────────────────────────────────────────────────────
      await run(
        OWNER_KEY,
        [buildDepositOp({ vaultId, assetContractId: assetId, amount: DEPOSIT_AMOUNT })],
        `deposit(${vaultId}, ${DEPOSIT_AMOUNT})`,
      );

      // ── 7. The chain state matches what the UI renders ──────────────────
      const configured = await readDomainVault(vaultId, null, { sourceAddress: OWNER });
      expect(configured.id).toBe(vaultId);
      expect(configured.owner).toBe(OWNER);
      expect(configured.asset.amount).toBe("100");
      expect(configured.beneficiaries).toHaveLength(1);
      expect(configured.beneficiaries[0].address).toBe(BENEFICIARY);
      expect(configured.beneficiaries[0].allocationBps).toBe(10_000);
      expect(configured.guardians.map((guardian) => guardian.address)).toEqual([GUARDIAN]);
      expect(configured.activation.trigger).toBe("multi-condition");
      expect(configured.activation.guardianThreshold).toBe(1);
      expect(["active", "grace", "triggered"]).toContain(configured.status);
      record(
        `read: get_vault(${vaultId}) → status=${configured.status}, balance=${configured.asset.amount}, ` +
          `beneficiaries=${configured.beneficiaries.length}, guardians=${configured.guardians.length}`,
      );

      const after = await readVaultsByOwner(OWNER, { limit: 25 });
      expect(after.items.map((item) => item.id)).toContain(vaultId);

      // ── 8. Wait for the check-in deadline + grace period to lapse ───────
      const deadlines = await readDeadlines(vaultId, { sourceAddress: OWNER });
      const graceEnd = new Date(deadlines.graceEnd).getTime();
      const waitMs = graceEnd - Date.now() + 5_000;
      record(`read: get_deadlines(${vaultId}) → grace_end=${deadlines.graceEnd}`);
      if (waitMs > 0) {
        record(`waiting ${Math.ceil(waitMs / 1000)}s for the grace period to lapse`);
        await sleep(waitMs);
      }

      // ── 9. Negative: activation must be refused without the threshold ───
      await expectRejection(
        OWNER_KEY,
        [buildActivateVaultOp({ vaultId })],
        `activate_vault(${vaultId}) before guardian approval`,
      );

      // ── 10. Guardian approves, then anyone may activate ─────────────────
      await run(
        GUARDIAN_KEY,
        [buildGuardianApproveOp({ vaultId, guardianAddress: GUARDIAN })],
        `guardian_approve(${vaultId})`,
      );

      const activated = await run(
        OWNER_KEY,
        [buildActivateVaultOp({ vaultId })],
        `activate_vault(${vaultId})`,
      );
      record(`activation confirmed: ${activated.hash}`);

      const live = await readDomainVault(vaultId, null, { sourceAddress: OWNER });
      expect(live.status).toBe("triggered");
      expect(live.activatedAt).toBeTruthy();
      expect(live.asset.amount).toBe("100");

      // ── 11. The beneficiary claims ──────────────────────────────────────
      const claimResult = await run(
        BENEFICIARY_KEY,
        [buildClaimOp({ vaultId, beneficiaryAddress: BENEFICIARY })],
        `claim(${vaultId}, heir)`,
      );
      const claimed = readVaultIdFromReturnValue(claimResult.returnValue);
      expect(claimed).toBe(DEPOSIT_AMOUNT.toString());
      record(`claim returned amount=${claimed}`);

      const settled = await readDomainVault(vaultId, null, { sourceAddress: OWNER });
      expect(settled.status).toBe("completed");
      expect(settled.asset.amount).toBe("0");
      expect(settled.claims?.[0]?.status).toBe("claimed");
      record(`read: final status=${settled.status}, balance=${settled.asset.amount}`);
    },
    600_000,
  );
});
