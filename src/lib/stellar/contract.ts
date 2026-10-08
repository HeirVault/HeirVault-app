/**
 * HeirVault Soroban contract boundary.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS FILE IS THE ONLY PLACE THAT KNOWS THE CONTRACT'S ENTRYPOINTS.
 *
 * If the `heirvault-contracts` repository changes a method name or an argument
 * shape, this module is the single place that needs updating. The rest of the
 * frontend talks to vaults through the domain types in `@/lib/vault/types`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Importing this module pulls in `@stellar/stellar-sdk`, so it is loaded lazily
 * (`await import("@/lib/stellar/contract")`) by the action layer and never by
 * purely presentational code. Configuration helpers live in `./config`, which
 * has no SDK dependency.
 *
 * The entrypoints below describe the interface this frontend expects from the
 * HeirVault contract. They are *not* a claim that a contract is deployed. When
 * `NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID` is unset, every builder throws
 * {@link ContractNotConfiguredError} before touching the network.
 */

import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

import { fromBaseUnits, toBaseUnits } from "@/lib/vault/calculations";
import { encodeEd25519PublicKey } from "@/lib/vault/strkey";
import {
  ACTIVATION_TRIGGERS,
  VAULT_STATUSES,
  type ActivationConditions,
  type ActivationTrigger,
  type Beneficiary,
  type Guardian,
  type GuardianRole,
  type Vault,
  type VaultStatus,
} from "@/lib/vault/types";

import { getRpcServer } from "./client";
import {
  ContractNotConfiguredError,
  getContractConfig,
  getSupportedAssets,
  isContractConfigured,
  requireContractId,
  type ContractConfig,
  type SupportedAsset,
} from "./config";
import { getNetworkConfig, type StellarNetworkId } from "./network";

export {
  ContractNotConfiguredError,
  getContractConfig,
  getSupportedAssets,
  isContractConfigured,
  requireContractId,
};
export type { ContractConfig, SupportedAsset };

/** Entrypoint names expected on the deployed contract. */
export const HEIRVAULT_METHODS = {
  createVault: "create_vault",
  getVault: "get_vault",
  listVaultsByOwner: "list_vaults_by_owner",
  deposit: "deposit",
  checkIn: "check_in",
  updateBeneficiaries: "update_beneficiaries",
  updateGuardians: "update_guardians",
  approveActivation: "approve_activation",
  triggerActivation: "trigger_activation",
  cancelVault: "cancel_vault",
  claim: "claim",
  getClaimStatus: "get_claim_status",
  getGuardians: "get_guardians",
  getTransactions: "get_transactions",
} as const;

export type HeirVaultMethod = (typeof HEIRVAULT_METHODS)[keyof typeof HEIRVAULT_METHODS];

/**
 * Declarative description of the expected ABI. Used for documentation and by
 * the "review" step of the wizard so the UI can show exactly which arguments
 * will be submitted.
 */
export const HEIRVAULT_CONTRACT_ABI: Record<HeirVaultMethod, { mutates: boolean; summary: string }> = {
  create_vault: {
    mutates: true,
    summary: "Creates a vault, its beneficiaries, guardians and activation policy.",
  },
  get_vault: { mutates: false, summary: "Reads a vault by id." },
  list_vaults_by_owner: { mutates: false, summary: "Lists vault ids owned by an address." },
  deposit: { mutates: true, summary: "Transfers assets from the owner into the vault." },
  check_in: { mutates: true, summary: "Records a liveness check-in from the owner." },
  update_beneficiaries: { mutates: true, summary: "Replaces the beneficiary allocation set." },
  update_guardians: { mutates: true, summary: "Replaces the guardian set." },
  approve_activation: { mutates: true, summary: "Records a guardian approval of activation." },
  trigger_activation: { mutates: true, summary: "Activates the vault once conditions are met." },
  cancel_vault: { mutates: true, summary: "Cancels the vault before activation." },
  claim: { mutates: true, summary: "Claims a beneficiary allocation after activation." },
  get_claim_status: { mutates: false, summary: "Reads a beneficiary's claim eligibility." },
  get_guardians: { mutates: false, summary: "Reads the guardian set and approval state." },
  get_transactions: { mutates: false, summary: "Reads recorded vault events." },
};

/** Instantiate the SDK Contract wrapper for the configured contract. */
export function getContract(): Contract {
  return new Contract(requireContractId());
}

// ── ScVal helpers ────────────────────────────────────────────────────────────

function addressScVal(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

function symbolScVal(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: "symbol" });
}

function u32ScVal(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: "u32" });
}

function i128ScVal(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "i128" });
}

function structScVal(fields: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    Object.entries(fields).map(([key, val]) => new xdr.ScMapEntry({ key: symbolScVal(key), val })),
  );
}

/** Encode a beneficiary allocation as the contract-facing struct. */
export function beneficiaryToScVal(beneficiary: Beneficiary): xdr.ScVal {
  return structScVal({
    address: addressScVal(beneficiary.address),
    allocation_bps: u32ScVal(beneficiary.allocationBps),
  });
}

/** Encode a guardian as the contract-facing struct. */
export function guardianToScVal(guardian: Guardian): xdr.ScVal {
  return structScVal({
    address: addressScVal(guardian.address),
    role: symbolScVal(guardian.role),
  });
}

/** Encode the activation policy as the contract-facing struct. */
export function activationToScVal(activation: ActivationConditions): xdr.ScVal {
  return structScVal({
    trigger: symbolScVal(activation.trigger),
    check_in_interval_days: u32ScVal(activation.checkInIntervalDays),
    grace_period_days: u32ScVal(activation.gracePeriodDays),
    guardian_threshold: u32ScVal(activation.guardianThreshold),
    emergency_enabled: nativeToScVal(activation.emergencyActivationEnabled, { type: "bool" }),
    scheduled_activation_at: activation.scheduledActivationAt
      ? nativeToScVal(
          Math.floor(new Date(activation.scheduledActivationAt).getTime() / 1000),
          { type: "u64" },
        )
      : xdr.ScVal.scvVoid(),
  });
}

// ── Operation builders ───────────────────────────────────────────────────────
//
// Each builder returns an unsigned operation. Simulation and signing happen in
// `transactions.ts`; nothing here submits anything or implies success.

export interface CreateVaultArgs {
  owner: string;
  name: string;
  assetContractId: string;
  /** Deposit amount in whole asset units (decimal string). */
  amount: string;
  assetDecimals: number;
  beneficiaries: Beneficiary[];
  guardians: Guardian[];
  activation: ActivationConditions;
}

export function buildCreateVaultOp(args: CreateVaultArgs): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.createVault,
    addressScVal(args.owner),
    nativeToScVal(args.name, { type: "string" }),
    addressScVal(args.assetContractId),
    i128ScVal(toBaseUnits(args.amount, args.assetDecimals)),
    xdr.ScVal.scvVec(args.beneficiaries.map(beneficiaryToScVal)),
    xdr.ScVal.scvVec(args.guardians.map(guardianToScVal)),
    activationToScVal(args.activation),
  );
}

export function buildDepositOp(params: {
  vaultId: string;
  from: string;
  amount: string;
  assetDecimals: number;
}): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.deposit,
    nativeToScVal(params.vaultId, { type: "string" }),
    addressScVal(params.from),
    i128ScVal(toBaseUnits(params.amount, params.assetDecimals)),
  );
}

export function buildCheckInOp(params: { vaultId: string; owner: string }): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.checkIn,
    nativeToScVal(params.vaultId, { type: "string" }),
    addressScVal(params.owner),
  );
}

export function buildClaimOp(params: { vaultId: string; beneficiary: string }): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.claim,
    nativeToScVal(params.vaultId, { type: "string" }),
    addressScVal(params.beneficiary),
  );
}

export function buildApproveActivationOp(params: {
  vaultId: string;
  guardian: string;
}): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.approveActivation,
    nativeToScVal(params.vaultId, { type: "string" }),
    addressScVal(params.guardian),
  );
}

export function buildTriggerActivationOp(params: {
  vaultId: string;
  caller: string;
}): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.triggerActivation,
    nativeToScVal(params.vaultId, { type: "string" }),
    addressScVal(params.caller),
  );
}

export function buildCancelVaultOp(params: { vaultId: string; owner: string }): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.cancelVault,
    nativeToScVal(params.vaultId, { type: "string" }),
    addressScVal(params.owner),
  );
}

export function buildUpdateBeneficiariesOp(params: {
  vaultId: string;
  owner: string;
  beneficiaries: Beneficiary[];
}): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.updateBeneficiaries,
    nativeToScVal(params.vaultId, { type: "string" }),
    addressScVal(params.owner),
    xdr.ScVal.scvVec(params.beneficiaries.map(beneficiaryToScVal)),
  );
}

export function buildUpdateGuardiansOp(params: {
  vaultId: string;
  owner: string;
  guardians: Guardian[];
}): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.updateGuardians,
    nativeToScVal(params.vaultId, { type: "string" }),
    addressScVal(params.owner),
    xdr.ScVal.scvVec(params.guardians.map(guardianToScVal)),
  );
}

// ── Reads: Soroban ScVal → domain Vault ──────────────────────────────────────
//
// Read entrypoints are *simulated* (never submitted) and their return value is
// decoded into the domain `Vault`. The record shape decoded here is the
// interface this frontend expects from `get_vault`; its field names mirror the
// argument structs the builders above submit (address / allocation_bps / role /
// check_in_interval_days / …) so the two sides stay in lockstep. If the
// contract returns a different shape, decoding throws rather than fabricating a
// vault.

/**
 * A deterministic, format-valid account used as the read-only transaction
 * source when the caller has no funded account of their own. Simulation never
 * submits, so this address only needs to be well-formed.
 */
const READ_ONLY_SOURCE = encodeEd25519PublicKey(new Uint8Array(32).fill(0x42));

/** Raised when a contract read cannot be simulated or its result decoded. */
export class ContractReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractReadError";
  }
}

/** Ambient data needed to turn a decoded record into a domain `Vault`. */
export interface VaultDecodeContext {
  network: StellarNetworkId;
  assetSymbol: string;
  assetDecimals: number;
  /** The HeirVault contract id, when one is configured. */
  contractId?: string;
}

export interface ReadOptions {
  network?: StellarNetworkId;
  /** Fee-paying source account for the simulated read. */
  sourceAddress?: string;
}

const GUARDIAN_ROLES: readonly GuardianRole[] = ["primary", "backup", "arbiter"];

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new ContractReadError(`Expected ${label} to be a struct, received ${typeof value}.`);
}

function readString(source: Record<string, unknown>, key: string, label: string): string {
  const value = source[key];
  if (typeof value === "string" && value.trim() !== "") return value;
  throw new ContractReadError(`Expected ${label}.${key} to be a non-empty string.`);
}

function readOptionalString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readInteger(source: Record<string, unknown>, key: string, label: string): number {
  const value = source[key];
  const parsed =
    typeof value === "bigint" ? Number(value) : typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new ContractReadError(`Expected ${label}.${key} to be an integer.`);
  }
  return parsed;
}

function readBigInt(source: Record<string, unknown>, key: string, label: string): bigint {
  const value = source[key];
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  throw new ContractReadError(`Expected ${label}.${key} to be an integer amount.`);
}

/** Convert a Soroban unix-seconds timestamp (u64) into an ISO string. */
function toIso(value: unknown): string | undefined {
  let seconds: number | undefined;
  if (typeof value === "bigint") seconds = Number(value);
  else if (typeof value === "number") seconds = value;
  else if (typeof value === "string" && /^\d+$/.test(value)) seconds = Number(value);
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(seconds * 1000).toISOString();
}

function requireIso(value: unknown, label: string): string {
  const iso = toIso(value);
  if (!iso) throw new ContractReadError(`Expected ${label} to be a positive timestamp.`);
  return iso;
}

function decodeStatus(value: unknown): VaultStatus {
  if (typeof value === "string" && (VAULT_STATUSES as readonly string[]).includes(value)) {
    return value as VaultStatus;
  }
  throw new ContractReadError(`Unknown vault status ${JSON.stringify(value)}.`);
}

function decodeTrigger(value: unknown): ActivationTrigger {
  if (typeof value === "string" && (ACTIVATION_TRIGGERS as readonly string[]).includes(value)) {
    return value as ActivationTrigger;
  }
  throw new ContractReadError(`Unknown activation trigger ${JSON.stringify(value)}.`);
}

function decodeBeneficiaries(value: unknown): Beneficiary[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ContractReadError("Expected vault.beneficiaries to be a list.");
  return value.map((entry, index) => {
    const label = `vault.beneficiaries[${index}]`;
    const record = asObject(entry, label);
    return {
      id: `b${index + 1}`,
      address: readString(record, "address", label),
      allocationBps: readInteger(record, "allocation_bps", label),
    };
  });
}

function decodeGuardians(value: unknown): Guardian[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ContractReadError("Expected vault.guardians to be a list.");
  return value.map((entry, index) => {
    const label = `vault.guardians[${index}]`;
    const record = asObject(entry, label);
    const rawRole = record.role;
    const role: GuardianRole =
      typeof rawRole === "string" && (GUARDIAN_ROLES as readonly string[]).includes(rawRole)
        ? (rawRole as GuardianRole)
        : "primary";
    return {
      id: `g${index + 1}`,
      address: readString(record, "address", label),
      role,
      approvalStatus: "pending",
    };
  });
}

function decodeActivation(value: unknown): ActivationConditions {
  const record = asObject(value ?? {}, "vault.activation");
  const scheduled = toIso(record.scheduled_activation_at);
  return {
    trigger: decodeTrigger(record.trigger),
    checkInIntervalDays: readInteger(record, "check_in_interval_days", "vault.activation"),
    gracePeriodDays: readInteger(record, "grace_period_days", "vault.activation"),
    guardianThreshold: readInteger(record, "guardian_threshold", "vault.activation"),
    emergencyActivationEnabled: record.emergency_enabled === true,
    ...(scheduled ? { scheduledActivationAt: scheduled } : {}),
  };
}

/** Decode an already-native `get_vault` result into a domain {@link Vault}. */
export function decodeVaultRecord(value: unknown, context: VaultDecodeContext): Vault {
  const record = asObject(value, "vault");
  const assetContractId = readString(record, "asset", "vault");
  const amount = readBigInt(record, "amount", "vault");

  return {
    id: readString(record, "id", "vault"),
    contractId: context.contractId,
    owner: readString(record, "owner", "vault"),
    name: readString(record, "name", "vault"),
    description: readOptionalString(record, "description"),
    status: decodeStatus(record.status),
    network: context.network,
    createdAt: requireIso(record.created_at, "vault.created_at"),
    asset: {
      contractId: assetContractId,
      symbol: context.assetSymbol,
      decimals: context.assetDecimals,
      amount: fromBaseUnits(amount, context.assetDecimals),
    },
    beneficiaries: decodeBeneficiaries(record.beneficiaries),
    guardians: decodeGuardians(record.guardians),
    activation: decodeActivation(record.activation),
    activationApprovals: [],
    lastCheckInAt: toIso(record.last_check_in_at),
    activatedAt: toIso(record.activated_at),
    completedAt: toIso(record.completed_at),
    cancelledAt: toIso(record.cancelled_at),
    // Events and per-beneficiary claim status come from their own entrypoints
    // (`get_transactions`, `get_claim_status`), not from `get_vault`.
    transactions: [],
    claims: [],
  };
}

/** Decode a raw `get_vault` ScVal (the form returned by simulation). */
export function decodeVaultScVal(scVal: xdr.ScVal, context: VaultDecodeContext): Vault {
  return decodeVaultRecord(scValToNative(scVal), context);
}

/** Decode a `list_vaults_by_owner` result (a vec of vault records). */
export function decodeVaultList(value: unknown, context: VaultDecodeContext): Vault[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ContractReadError("Expected a list of vaults.");
  return value.map((entry) => decodeVaultRecord(entry, context));
}

/** Simulate a read-only contract call and return the native return value. */
async function simulateRead(
  method: HeirVaultMethod,
  args: xdr.ScVal[],
  options: ReadOptions = {},
): Promise<unknown> {
  const server = getRpcServer(options.network);
  const source = new Account(options.sourceAddress ?? READ_ONLY_SOURCE, "0");
  const transaction = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkConfig(options.network).passphrase,
  })
    .addOperation(getContract().call(method, ...args))
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(transaction);
  if (rpc.Api.isSimulationError(simulation)) {
    throw new ContractReadError(`Contract read failed: ${simulation.error}`);
  }
  if (!simulation.result) {
    throw new ContractReadError("The contract returned no value for this read.");
  }
  return scValToNative(simulation.result.retval);
}

/** Read a single vault's native record via `get_vault`. */
export async function readVaultRecord(
  vaultId: string,
  options: ReadOptions = {},
): Promise<unknown> {
  return simulateRead(
    HEIRVAULT_METHODS.getVault,
    [nativeToScVal(vaultId, { type: "string" })],
    options,
  );
}

/** Read an owner's vault records via `list_vaults_by_owner`. */
export async function readVaultsByOwner(
  owner: string,
  options: ReadOptions = {},
): Promise<unknown> {
  return simulateRead(HEIRVAULT_METHODS.listVaultsByOwner, [addressScVal(owner)], {
    ...options,
    sourceAddress: options.sourceAddress ?? owner,
  });
}
