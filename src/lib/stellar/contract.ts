/**
 * HeirVault Soroban contract boundary.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS FILE IS THE ONLY PLACE THAT KNOWS THE CONTRACT'S ENTRYPOINTS.
 *
 * The entrypoints below are derived from the HeirVault contract source and were
 * confirmed against the deployed Testnet contract before this rewrite. If the
 * `heirvault-contracts` repository changes a method name or an argument shape,
 * this module is the single place that needs updating.
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

import { fromBaseUnits } from "@/lib/vault/calculations";
import { encodeEd25519PublicKey } from "@/lib/vault/strkey";
import type {
  ActivationTrigger,
  Beneficiary,
  BeneficiaryClaim,
  Guardian,
  Vault,
  VaultStatus,
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

export function getContract(): Contract {
  return new Contract(requireContractId());
}

export { ContractNotConfiguredError, isContractConfigured, requireContractId };

export { getContractConfig, getSupportedAssets };
export type { ContractConfig, SupportedAsset };

// ---------------------------------------------------------------------------
// Real contract entrypoint names
// ---------------------------------------------------------------------------

/**
 * Entrypoint names exported by the HeirVault Soroban contract.
 *
 * These match the `#[contractimpl]` block in the `heirvault-contracts`
 * repository and were confirmed against the deployed Testnet contract before
 * this rewrite.
 */
export const HEIRVAULT_METHODS = {
  createVault: "create_vault",
  deposit: "deposit",
  addBeneficiary: "add_beneficiary",
  removeBeneficiary: "remove_beneficiary",
  updateBeneficiary: "update_beneficiary",
  getBeneficiaries: "get_beneficiaries",
  getActiveBeneficiaries: "get_active_beneficiaries",
  getTotalAllocation: "get_total_allocation",
  addGuardian: "add_guardian",
  removeGuardian: "remove_guardian",
  setGuardianThreshold: "set_guardian_threshold",
  guardianApprove: "guardian_approve",
  getGuardians: "get_guardians",
  getGuardianStatus: "get_guardian_status",
  checkIn: "check_in",
  activateVault: "activate_vault",
  cancelVault: "cancel_vault",
  withdraw: "withdraw",
  claim: "claim",
  getClaims: "get_claims",
  getClaim: "get_claim",
  getUndistributedBalance: "get_undistributed_balance",
  getVault: "get_vault",
  getVaultStatus: "get_vault_status",
  getDeadlines: "get_deadlines",
  isClaimable: "is_claimable",
  getVaultsByOwner: "get_vaults_by_owner",
  getVaultsByBeneficiary: "get_vaults_by_beneficiary",
  getVaultCount: "get_vault_count",
  schemaVersion: "schema_version",
} as const;

export type HeirVaultMethod = (typeof HEIRVAULT_METHODS)[keyof typeof HEIRVAULT_METHODS];

/**
 * Activation modes exported by the HeirVault contract.
 *
 * These match the contract's `ActivationMode` enum. The frontend keeps an
 * application-level activation model in `@/lib/vault/types`; this enum is the
 * contract-facing shape only.
 */
export const ACTIVATION_MODES = [
  "MissedCheckIn",
  "GuardianApproval",
  "MultiCondition",
] as const;
export type ActivationModeValue = (typeof ACTIVATION_MODES)[number];

/**
 * Vault statuses exported by the HeirVault contract.
 *
 * These match the contract's `VaultStatus` enum. The frontend keeps its own
 * application status layer in `@/lib/vault/types`; this enum is the
 * contract-facing shape only.
 */
export const VAULT_STATUS_VALUES = [
  "Active",
  "GracePeriod",
  "Activated",
  "Cancelled",
  "Completed",
] as const;
export type VaultStatusValue = (typeof VAULT_STATUS_VALUES)[number];

// ---------------------------------------------------------------------------
// ScVal helpers
// ---------------------------------------------------------------------------

function addressScVal(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

function symbolScVal(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: "symbol" });
}

function u32ScVal(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: "u32" });
}

function u64ScVal(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "u64" });
}

function i128ScVal(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "i128" });
}

function u64FromDecimalString(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Expected a non-negative integer vault id, received ${value}.`);
  }
  return BigInt(trimmed);
}

function structScVal(fields: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    Object.entries(fields).map(([key, val]) => new xdr.ScMapEntry({ key: symbolScVal(key), val })),
  );
}

/** Encode a beneficiary as the contract-facing struct. */
export function beneficiaryToScVal(beneficiary: Beneficiary): xdr.ScVal {
  return structScVal({
    address: addressScVal(beneficiary.address),
    allocation_bps: u32ScVal(beneficiary.allocationBps),
  });
}

/**
 * Encode an activation mode as the contract-facing value.
 *
 * Soroban encodes a Rust enum variant as `ScVec[Symbol]`, **not** as a bare
 * symbol — sending a bare symbol makes the host fail while decoding the entry
 * point's arguments.
 */
export function activationModeScVal(mode: ActivationModeValue): xdr.ScVal {
  return xdr.ScVal.scvVec([symbolScVal(mode)]);
}

// ---------------------------------------------------------------------------
// Operation builders
// ---------------------------------------------------------------------------
//
// Each builder returns an unsigned operation. Simulation, signing and submission
// happen in `transactions.ts`; nothing here submits anything or implies success.

/**
 * Create a new vault.
 *
 * Real contract signature:
 *   create_vault(owner, asset, activation_mode, check_in_period_seconds, grace_period_seconds) -> u64
 *
 * The vault starts unfunded. Funding is a separate `deposit` call.
 */
export interface CreateVaultArgs {
  owner: string;
  assetContractId: string;
  activationMode: ActivationModeValue;
  checkInPeriodSeconds: number;
  gracePeriodSeconds: number;
}
export function buildCreateVaultOp(args: CreateVaultArgs): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.createVault,
    addressScVal(args.owner),
    addressScVal(args.assetContractId),
    activationModeScVal(args.activationMode),
    u64ScVal(BigInt(args.checkInPeriodSeconds)),
    u64ScVal(BigInt(args.gracePeriodSeconds)),
  );
}

/**
 * Deposit into a vault.
 *
 * Real contract signature:
 *   deposit(vault_id, asset, amount) -> Result<(), HeirVaultError>
 *
 * `asset` must equal the vault's configured asset.
 */
export interface DepositArgs {
  vaultId: string;
  assetContractId: string;
  amount: bigint;
}
export function buildDepositOp(args: DepositArgs): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.deposit,
    u64ScVal(u64FromDecimalString(args.vaultId)),
    addressScVal(args.assetContractId),
    i128ScVal(args.amount),
  );
}

/**
 * Add a beneficiary.
 *
 * Real contract signature:
 *   add_beneficiary(vault_id, beneficiary, allocation_bps) -> Result<(), HeirVaultError>
 */
export interface AddBeneficiaryArgs {
  vaultId: string;
  beneficiaryAddress: string;
  allocationBps: number;
}
export function buildAddBeneficiaryOp(args: AddBeneficiaryArgs): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.addBeneficiary,
    u64ScVal(u64FromDecimalString(args.vaultId)),
    addressScVal(args.beneficiaryAddress),
    u32ScVal(args.allocationBps),
  );
}

/**
 * Remove a beneficiary.
 *
 * Real contract signature:
 *   remove_beneficiary(vault_id, beneficiary) -> Result<(), HeirVaultError>
 */
export interface RemoveBeneficiaryArgs {
  vaultId: string;
  beneficiaryAddress: string;
}
export function buildRemoveBeneficiaryOp(args: RemoveBeneficiaryArgs): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.removeBeneficiary,
    u64ScVal(u64FromDecimalString(args.vaultId)),
    addressScVal(args.beneficiaryAddress),
  );
}

/**
 * Update a beneficiary's allocation.
 *
 * Real contract signature:
 *   update_beneficiary(vault_id, beneficiary, new_allocation_bps) -> Result<(), HeirVaultError>
 */
export interface UpdateBeneficiaryArgs {
  vaultId: string;
  beneficiaryAddress: string;
  newAllocationBps: number;
}
export function buildUpdateBeneficiaryOp(args: UpdateBeneficiaryArgs): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.updateBeneficiary,
    u64ScVal(u64FromDecimalString(args.vaultId)),
    addressScVal(args.beneficiaryAddress),
    u32ScVal(args.newAllocationBps),
  );
}

/**
 * Add a guardian.
 *
 * Real contract signature:
 *   add_guardian(vault_id, guardian) -> Result<(), HeirVaultError>
 */
export interface AddGuardianArgs {
  vaultId: string;
  guardianAddress: string;
}
export function buildAddGuardianOp(args: AddGuardianArgs): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.addGuardian,
    u64ScVal(u64FromDecimalString(args.vaultId)),
    addressScVal(args.guardianAddress),
  );
}

/**
 * Remove a guardian.
 *
 * Real contract signature:
 *   remove_guardian(vault_id, guardian) -> Result<(), HeirVaultError>
 */
export interface RemoveGuardianArgs {
  vaultId: string;
  guardianAddress: string;
}
export function buildRemoveGuardianOp(args: RemoveGuardianArgs): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.removeGuardian,
    u64ScVal(u64FromDecimalString(args.vaultId)),
    addressScVal(args.guardianAddress),
  );
}

/**
 * Set the guardian approval threshold.
 *
 * Real contract signature:
 *   set_guardian_threshold(vault_id, threshold) -> Result<(), HeirVaultError>
 */
export interface SetGuardianThresholdArgs {
  vaultId: string;
  threshold: number;
}
export function buildSetGuardianThresholdOp(args: SetGuardianThresholdArgs): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.setGuardianThreshold,
    u64ScVal(u64FromDecimalString(args.vaultId)),
    u32ScVal(args.threshold),
  );
}

/**
 * Record a guardian's approval of the current activation attempt.
 *
 * Real contract signature:
 *   guardian_approve(vault_id, guardian) -> Result<(), HeirVaultError>
 */
export interface GuardianApproveArgs {
  vaultId: string;
  guardianAddress: string;
}
export function buildGuardianApproveOp(args: GuardianApproveArgs): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.guardianApprove,
    u64ScVal(u64FromDecimalString(args.vaultId)),
    addressScVal(args.guardianAddress),
  );
}

/**
 * Check in.
 *
 * Real contract signature:
 *   check_in(vault_id) -> Result<u64, HeirVaultError>
 *
 * Returns the new deadline.
 */
export interface CheckInArgs {
  vaultId: string;
}
export function buildCheckInOp(args: CheckInArgs): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.checkIn,
    u64ScVal(u64FromDecimalString(args.vaultId)),
  );
}

/**
 * Activate a vault.
 *
 * Real contract signature:
 *   activate_vault(vault_id) -> Result<(), HeirVaultError>
 *
 * Permissionless. Re-validates every activation condition at call time.
 */
export interface ActivateVaultArgs {
  vaultId: string;
}
export function buildActivateVaultOp(args: ActivateVaultArgs): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.activateVault,
    u64ScVal(u64FromDecimalString(args.vaultId)),
  );
}

/**
 * Cancel a vault.
 *
 * Real contract signature:
 *   cancel_vault(vault_id) -> Result<(), HeirVaultError>
 */
export interface CancelVaultArgs {
  vaultId: string;
}
export function buildCancelVaultOp(args: CancelVaultArgs): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.cancelVault,
    u64ScVal(u64FromDecimalString(args.vaultId)),
  );
}

/**
 * Withdraw from a cancelled vault.
 *
 * Real contract signature:
 *   withdraw(vault_id, amount) -> Result<(), HeirVaultError>
 */
export interface WithdrawArgs {
  vaultId: string;
  amount: bigint;
}
export function buildWithdrawOp(args: WithdrawArgs): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.withdraw,
    u64ScVal(u64FromDecimalString(args.vaultId)),
    i128ScVal(args.amount),
  );
}

/**
 * Claim.
 *
 * Real contract signature:
 *   claim(vault_id, beneficiary) -> Result<i128, HeirVaultError>
 *
 * `beneficiary` must authenticate. Returns the amount transferred.
 */
export interface ClaimArgs {
  vaultId: string;
  beneficiaryAddress: string;
}
export function buildClaimOp(args: ClaimArgs): xdr.Operation {
  const contract = getContract();
  return contract.call(
    HEIRVAULT_METHODS.claim,
    u64ScVal(u64FromDecimalString(args.vaultId)),
    addressScVal(args.beneficiaryAddress),
  );
}

// ---------------------------------------------------------------------------
// Reads: Soroban ScVal → domain types
// ---------------------------------------------------------------------------

/**
 * A deterministic, format-valid account used as the read-only transaction
 * source when simulating reads. Simulation never submits, so this address only
 * needs to be well-formed.
 */
const READ_ONLY_SOURCE = encodeEd25519PublicKey(new Uint8Array(32).fill(0x42));

/** Raised when a contract read cannot be simulated or its result decoded. */
export class ContractReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractReadError";
  }
}

/** Ambient data needed to turn a decoded record into domain types. */
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
  offset?: number;
  limit?: number;
}

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

function readInteger(source: Record<string, unknown>, key: string, label: string): number {
  const value = source[key];
  const parsed =
    typeof value === "bigint" ? Number(value) : typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new ContractReadError(`Expected ${label}.${key} to be an integer.`);
  }
  return parsed;
}

/**
 * Read an integer amount.
 *
 * Two call shapes are supported:
 *  - `readBigInt(record, "balance", "vault")` → `record.balance`, labelled
 *    `vault.balance`;
 *  - `readBigInt(value, "vault.id")` → `value` itself, labelled `vault.id`.
 */
function readBigInt(source: unknown, key: string, label?: string): bigint {
  const raw = label === undefined ? source : (source as Record<string, unknown> | null | undefined)?.[key];
  const at = label === undefined ? key : `${label}.${key}`;
  if (typeof raw === "bigint") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return BigInt(Math.trunc(raw));
  if (typeof raw === "string" && /^-?\d+$/.test(raw)) return BigInt(raw);
  throw new ContractReadError(`Expected ${at} to be an integer amount.`);
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

/**
 * Read a Rust enum value that Soroban encodes as `ScVec[Symbol]`.
 *
 * `scValToNative` decodes that shape to a single-element array; a bare symbol
 * string is accepted too so the decoder stays tolerant of both encodings.
 */
function readEnumString(value: unknown, label: string): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") return value[0];
  throw new ContractReadError(`Expected ${label} to be an enum symbol.`);
}

function decodeStatus(value: unknown): VaultStatusValue {
  const status = readEnumString(value, "status");
  if ((VAULT_STATUS_VALUES as readonly string[]).includes(status)) {
    return status as VaultStatusValue;
  }
  throw new ContractReadError(`Unknown vault status ${JSON.stringify(value)}.`);
}

/**
 * Map a contract `VaultStatus` onto the frontend's own lifecycle vocabulary.
 *
 * The contract knows five states; the UI adds `draft` for a vault that has been
 * configured locally but not yet deployed.
 */
export function toAppVaultStatus(status: VaultStatusValue): VaultStatus {
  switch (status) {
    case "Active":
      return "active";
    case "GracePeriod":
      return "grace";
    case "Activated":
      return "triggered";
    case "Cancelled":
      return "cancelled";
    case "Completed":
      return "completed";
    default:
      throw new ContractReadError(`Unknown vault status ${JSON.stringify(status)}.`);
  }
}

function decodeActivationMode(value: unknown): ActivationModeValue {
  const mode = readEnumString(value, "activation_mode");
  if ((ACTIVATION_MODES as readonly string[]).includes(mode)) {
    return mode as ActivationModeValue;
  }
  throw new ContractReadError(`Unknown activation mode ${JSON.stringify(value)}.`);
}

/** Decode the beneficiary list returned by `get_beneficiaries` / `get_active_beneficiaries`. */
export function decodeBeneficiaryList(value: unknown): Beneficiary[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ContractReadError("Expected a beneficiary list.");
  return value
    .map((entry, index) => {
      const label = `beneficiary[${index}]`;
      const record = asObject(entry, label);
      // Deactivated slots are retained on-chain for audit history; they are not
      // part of the vault's current allocation, so they are not surfaced.
      if (record.active === false) return null;
      return {
        id: `b${index + 1}`,
        address: readString(record, "address", label),
        allocationBps: readInteger(record, "allocation_bps", label),
      };
    })
    .filter((entry): entry is Beneficiary => entry !== null);
}

/**
 * Decode a guardian slot as returned by the contract.
 *
 * The contract stores `{ address, active, approved }` only — it has no notion
 * of a guardian *role*. `primary` is therefore a local display default, and
 * `approvalStatus` is derived from the contract's `approved` vote on the
 * current activation attempt.
 */
function decodeGuardianSlot(value: unknown, index: number): Guardian {
  const label = `guardian[${index}]`;
  const record = asObject(value, label);
  const active = record.active !== false;
  const approved = record.approved === true;
  return {
    id: `g${index + 1}`,
    address: readString(record, "address", label),
    role: "primary",
    approvalStatus: !active ? "revoked" : approved ? "approved" : "pending",
  };
}

/** Decode the guardian list returned by `get_guardians` (active slots only). */
export function decodeGuardianList(value: unknown): Guardian[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ContractReadError("Expected a guardian list.");
  return value
    .map((entry, index) => {
      const record = asObject(entry, `guardian[${index}]`);
      if (record.active === false) return null;
      return decodeGuardianSlot(entry, index);
    })
    .filter((entry): entry is Guardian => entry !== null);
}

/**
 * Decode the claim record returned by `get_claim` / `get_claims`.
 *
 * Contract-facing claim record fields: beneficiary, allocation_bps, entitlement,
 * claimed_amount, claimed.
 */
export interface DecodedClaimRecord {
  beneficiary: string;
  allocationBps: number;
  entitlement: string;
  claimedAmount: string;
  claimed: boolean;
}

export function decodeClaimRecord(value: unknown, index: number): DecodedClaimRecord {
  const label = `claim[${index}]`;
  const record = asObject(value, label);
  return {
    beneficiary: readString(record, "beneficiary", label),
    allocationBps: readInteger(record, "allocation_bps", label),
    entitlement: String(readBigInt(record, "entitlement", label)),
    claimedAmount: String(readBigInt(record, "claimed_amount", label)),
    claimed: record.claimed === true,
  };
}

/**
 * Legacy alias for `DecodedClaimRecord`.
 * Kept so existing tests that expected the old claim record shape continue to
 * compile while the app moves to the new contract-facing read API.
 */
export type LegacyDecodedClaimRecord = DecodedClaimRecord;
export function decodeClaimList(value: unknown): DecodedClaimRecord[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ContractReadError("Expected a claim list.");
  return value.map((entry, index) => decodeClaimRecord(entry, index));
}

/**
 * Legacy alias for `decodeVaultPage`.
 * Kept so existing tests that imported `decodeVaultList` continue to compile.
 */
export function decodeVaultList(value: unknown): DecodedVaultPage {
  return decodeVaultPage(value);
}

/** Decode `PageMeta` from a list result. */
export interface PageMeta {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
}

function decodePageMeta(value: unknown, label: string): PageMeta {
  const record = asObject(value, label);
  const next = record.next_offset;
  return {
    total: readInteger(record, "total", label),
    offset: readInteger(record, "offset", label),
    limit: readInteger(record, "limit", label),
    hasMore: record.has_more === true,
    // `next_offset` is `Option<u32>`: a number, a bigint, or null/void.
    nextOffset:
      typeof next === "number"
        ? next
        : typeof next === "bigint"
          ? Number(next)
          : null,
  };
}

/**
 * Decode a `VaultSummary` as returned by list endpoints.
 *
 * Contract-facing compact projection: id, owner, asset, balance, status,
 * activation_mode, check_in_period, grace_period, last_check_in, deadline,
 * grace_end, beneficiary_count, guardian_count, total_allocation_bps, schema_version.
 */
export interface DecodedVaultSummary {
  id: string;
  owner: string;
  assetContractId: string;
  balance: string;
  status: VaultStatusValue;
  activationMode: ActivationModeValue;
  checkInPeriodSeconds: number;
  gracePeriodSeconds: number;
  lastCheckInAt: string;
  deadline: string;
  graceEnd: string;
  beneficiaryCount: number;
  guardianCount: number;
  totalAllocationBps: number;
  schemaVersion: number;
}

function decodeVaultSummary(value: unknown, index: number): DecodedVaultSummary {
  const label = `vault_summary[${index}]`;
  const record = asObject(value, label);
  return {
    id: String(readBigInt(record, "id", label)),
    owner: readString(record, "owner", label),
    assetContractId: readString(record, "asset", label),
    balance: String(readBigInt(record, "balance", label)),
    status: decodeStatus(record.status),
    activationMode: decodeActivationMode(record.activation_mode),
    checkInPeriodSeconds: readInteger(record, "check_in_period", label),
    gracePeriodSeconds: readInteger(record, "grace_period", label),
    lastCheckInAt: requireIso(record.last_check_in, `${label}.last_check_in`),
    deadline: requireIso(record.deadline, `${label}.deadline`),
    graceEnd: requireIso(record.grace_end, `${label}.grace_end`),
    beneficiaryCount: readInteger(record, "beneficiary_count", label),
    guardianCount: readInteger(record, "guardian_count", label),
    totalAllocationBps: readInteger(record, "total_allocation_bps", label),
    schemaVersion: readInteger(record, "schema_version", label),
  };
}

/** Decode a `VaultPage` returned by `get_vaults_by_owner`. */
export interface DecodedVaultPage {
  items: DecodedVaultSummary[];
  meta: PageMeta;
}

export function decodeVaultPage(value: unknown): DecodedVaultPage {
  const record = asObject(value, "vault_page");
  if (!Array.isArray(record.items)) {
    throw new ContractReadError("Expected vault_page.items to be a list.");
  }
  return {
    items: record.items.map((entry, index) => decodeVaultSummary(entry, index)),
    meta: decodePageMeta(record.meta, "vault_page.meta"),
  };
}

/** Decode `get_vaults_by_beneficiary` result. */
export interface DecodedBeneficiaryVaultPage {
  vaultIds: string[];
  meta: PageMeta;
}

export function decodeBeneficiaryVaultPage(value: unknown): DecodedBeneficiaryVaultPage {
  const record = asObject(value, "beneficiary_vault_page");
  const ids = record.vault_ids;
  if (ids !== undefined && ids !== null && !Array.isArray(ids)) {
    throw new ContractReadError("Expected beneficiary_vault_page.vault_ids to be a list.");
  }
  return {
    vaultIds: ((ids as unknown[]) ?? []).map((id) => String(readBigInt(id, "beneficiary_vault_page.vault_ids"))),
    meta: decodePageMeta(record.meta, "beneficiary_vault_page.meta"),
  };
}

/** Decode `get_deadlines` result. */
export interface Deadlines {
  /** `last_check_in + check_in_period`, as an ISO string. */
  deadline: string;
  /** `deadline + grace_period`, as an ISO string. */
  graceEnd: string;
  /** Current ledger timestamp at the moment of the read, as an ISO string. */
  now: string;
}

export function decodeDeadlines(value: unknown): Deadlines {
  const record = asObject(value, "deadlines");
  return {
    deadline: requireIso(record.deadline, "deadlines.deadline"),
    graceEnd: requireIso(record.grace_end, "deadlines.grace_end"),
    now: requireIso(record.now, "deadlines.now"),
  };
}

/** Decode `get_guardian_status` result. */
export interface DecodedGatewayStatus {
  approvals: number;
  threshold: number;
  guardianCount: number;
  thresholdMet: boolean;
}

export function decodeGatewayStatus(value: unknown): DecodedGatewayStatus {
  const record = asObject(value, "guardian_status");
  return {
    approvals: readInteger(record, "approvals", "guardian_status"),
    threshold: readInteger(record, "threshold", "guardian_status"),
    guardianCount: readInteger(record, "guardian_count", "guardian_status"),
    thresholdMet: record.threshold_met === true,
  };
}

/**
 * Legacy alias for `DecodedVault`.
 * Kept so existing tests that imported `decodeVaultRecord` continue to compile.
 */
export type LegacyDecodedVault = DecodedVault;

export interface DecodedVault {
  id: string;
  owner: string;
  assetContractId: string;
  balance: string;
  status: VaultStatusValue;
  activationMode: ActivationModeValue;
  checkInPeriodSeconds: number;
  gracePeriodSeconds: number;
  lastCheckInAt: string;
  lastStatusChangeAt: string;
  activatedAt: string | null;
  distributionBalance: string;
  totalClaimed: string;
  claimedCount: number;
  beneficiaries: Beneficiary[];
  guardians: Guardian[];
  guardianThreshold: number;
  guardianApprovals: number;
  createdAt: string;
  schemaVersion: number;
}

/** Contract-facing vault info plus the derived fields the contract returns. */
export interface DecodedVaultInfo {
  vault: DecodedVault;
  deadline: string;
  graceEnd: string;
  effectiveStatus: VaultStatusValue;
  totalAllocationBps: number;
  guardianThreshold: number;
  guardianApprovals: number;
  activationReady: boolean;
}

/**
 * Legacy alias for `decodeVaultInfo`.
 * Kept so existing tests that imported `decodeVaultRecord` continue to compile.
 */
export function decodeVaultRecord(value: unknown, context: VaultDecodeContext): DecodedVault {
  const info = decodeVaultInfo(value, context);
  return info.vault;
}

export function decodeVaultScVal(scVal: unknown, context: VaultDecodeContext): DecodedVault {
  // The SDK path `scValToNative` is applied by the caller in the old test. We
  // intentionally keep this thin: this alias exists for test compat, not as the
  // primary decode path.
  return decodeVaultRecord(scVal as unknown, context);
}

export function decodeVaultInfo(value: unknown, context: VaultDecodeContext): DecodedVaultInfo {
  void context;
  const record = asObject(value, "vault_info");
  const vaultRecord = asObject(record.vault, "vault_info.vault");

  const id = String(readBigInt(vaultRecord, "id", "vault_info.vault"));
  const owner = readString(vaultRecord, "owner", "vault_info.vault");
  const assetContractId = readString(vaultRecord, "asset", "vault_info.vault");
  const balance = String(readBigInt(vaultRecord, "balance", "vault_info.vault"));
  const status = decodeStatus(vaultRecord.status);
  const activationMode = decodeActivationMode(vaultRecord.activation_mode);
  const checkInPeriodSeconds = readInteger(vaultRecord, "check_in_period", "vault_info.vault");
  const gracePeriodSeconds = readInteger(vaultRecord, "grace_period", "vault_info.vault");
  const lastCheckInAt = requireIso(vaultRecord.last_check_in, "vault_info.vault.last_check_in");
  const lastStatusChangeAt = requireIso(vaultRecord.last_status_change, "vault_info.vault.last_status_change");
  const activatedAtRaw = toIso(vaultRecord.activated_at);
  const activatedAt = activatedAtRaw ?? null;
  const distributionBalance = String(readBigInt(vaultRecord, "distribution_balance", "vault_info.vault"));
  const totalClaimed = String(readBigInt(vaultRecord, "total_claimed", "vault_info.vault"));
  const claimedCount = readInteger(vaultRecord, "claimed_count", "vault_info.vault");
  const guardianThreshold = readInteger(vaultRecord, "guardian_threshold", "vault_info.vault");
  const guardianApprovals = readInteger(vaultRecord, "guardian_approvals", "vault_info.vault");
  const createdAt = requireIso(vaultRecord.created_at, "vault_info.vault.created_at");
  const schemaVersion = readInteger(vaultRecord, "schema_version", "vault_info.vault");

  const beneficiaries: Beneficiary[] = decodeBeneficiaryList(vaultRecord.beneficiaries);

  const guardians: Guardian[] = decodeGuardianList(vaultRecord.guardians);

  return {
    vault: {
      id,
      owner,
      assetContractId,
      balance,
      status,
      activationMode,
      checkInPeriodSeconds,
      gracePeriodSeconds,
      lastCheckInAt,
      lastStatusChangeAt,
      activatedAt,
      distributionBalance,
      totalClaimed,
      claimedCount,
      beneficiaries,
      guardians,
      guardianThreshold,
      guardianApprovals,
      createdAt,
      schemaVersion,
    },
    deadline: requireIso(record.deadline, "vault_info.deadline"),
    graceEnd: requireIso(record.grace_end, "vault_info.grace_end"),
    effectiveStatus: decodeStatus(record.effective_status),
    totalAllocationBps: readInteger(record, "total_allocation_bps", "vault_info"),
    guardianThreshold: readInteger(record, "guardian_threshold", "vault_info"),
    guardianApprovals: readInteger(record, "guardian_approvals", "vault_info"),
    activationReady: record.activation_ready === true,
  };
}

// ---------------------------------------------------------------------------
// Simulated reads
// ---------------------------------------------------------------------------

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

function contextFor(options: ReadOptions): VaultDecodeContext {
  const config = getContractConfig();
  return {
    network: options.network ?? getNetworkConfig().id,
    assetSymbol: config.assetSymbol,
    assetDecimals: config.assetDecimals,
    contractId: config.contractId ?? undefined,
  };
}

/** Read a single vault's info via `get_vault`. */
export async function readVaultInfo(
  vaultId: string,
  options: ReadOptions = {},
): Promise<DecodedVaultInfo> {
  const native = await simulateRead(
    HEIRVAULT_METHODS.getVault,
    [u64ScVal(u64FromDecimalString(vaultId))],
    options,
  );
  return decodeVaultInfo(native, contextFor(options));
}

/** Read an owner's vault page via `get_vaults_by_owner`. */
export async function readVaultsByOwner(
  owner: string,
  options: ReadOptions = {},
): Promise<DecodedVaultPage> {
  const native = await simulateRead(
    HEIRVAULT_METHODS.getVaultsByOwner,
    [addressScVal(owner), u32ScVal(options.offset ?? 0), u32ScVal(options.limit ?? 25)],
    options,
  );
  return decodeVaultPage(native);
}

/** Read a beneficiary's vault id page via `get_vaults_by_beneficiary`. */
export async function readVaultsByBeneficiary(
  beneficiary: string,
  options: ReadOptions = {},
): Promise<DecodedBeneficiaryVaultPage> {
  const native = await simulateRead(
    HEIRVAULT_METHODS.getVaultsByBeneficiary,
    [addressScVal(beneficiary), u32ScVal(options.offset ?? 0), u32ScVal(options.limit ?? 25)],
    options,
  );
  return decodeBeneficiaryVaultPage(native);
}

/** Read a vault's beneficiaries via `get_beneficiaries`. */
export async function readBeneficiaries(
  vaultId: string,
  options: ReadOptions = {},
): Promise<Beneficiary[]> {
  const native = await simulateRead(
    HEIRVAULT_METHODS.getBeneficiaries,
    [u64ScVal(u64FromDecimalString(vaultId)), u32ScVal(options.offset ?? 0), u32ScVal(options.limit ?? 25)],
    options,
  );
  return decodeBeneficiaryList(native);
}

/** Read a vault's active beneficiaries via `get_active_beneficiaries`. */
export async function readActiveBeneficiaries(
  vaultId: string,
  options: ReadOptions = {},
): Promise<Beneficiary[]> {
  const native = await simulateRead(
    HEIRVAULT_METHODS.getActiveBeneficiaries,
    [u64ScVal(u64FromDecimalString(vaultId))],
    options,
  );
  return decodeBeneficiaryList(native);
}

/** Read a vault's guardians via `get_guardians`. */
export async function readGuardians(
  vaultId: string,
  options: ReadOptions = {},
): Promise<Guardian[]> {
  const native = await simulateRead(
    HEIRVAULT_METHODS.getGuardians,
    [u64ScVal(u64FromDecimalString(vaultId)), u32ScVal(options.offset ?? 0), u32ScVal(options.limit ?? 25)],
    options,
  );
  return decodeGuardianList(native);
}

/** Read a vault's guardian status via `get_guardian_status`. */
export async function readGatewayStatus(
  vaultId: string,
  options: ReadOptions = {},
): Promise<DecodedGatewayStatus> {
  const native = await simulateRead(
    HEIRVAULT_METHODS.getGuardianStatus,
    [u64ScVal(u64FromDecimalString(vaultId))],
    options,
  );
  return decodeGatewayStatus(native);
}

/** Read a vault's claims via `get_claims`. */
export async function readClaims(
  vaultId: string,
  options: ReadOptions = {},
): Promise<DecodedClaimRecord[]> {
  const native = await simulateRead(
    HEIRVAULT_METHODS.getClaims,
    [u64ScVal(u64FromDecimalString(vaultId)), u32ScVal(options.offset ?? 0), u32ScVal(options.limit ?? 25)],
    options,
  );
  return decodeClaimList(native);
}

/** Read one beneficiary's claim record via `get_claim`. */
export async function readClaim(
  vaultId: string,
  beneficiaryAddress: string,
  options: ReadOptions = {},
): Promise<DecodedClaimRecord> {
  const native = await simulateRead(
    HEIRVAULT_METHODS.getClaim,
    [u64ScVal(u64FromDecimalString(vaultId)), addressScVal(beneficiaryAddress)],
    options,
  );
  return decodeClaimRecord(native, 0);
}

/** Read a vault's deadlines via `get_deadlines`. */
export async function readDeadlines(
  vaultId: string,
  options: ReadOptions = {},
): Promise<Deadlines> {
  const native = await simulateRead(
    HEIRVAULT_METHODS.getDeadlines,
    [u64ScVal(u64FromDecimalString(vaultId))],
    options,
  );
  return decodeDeadlines(native);
}

/** Read whether a vault is claimable via `is_claimable`. */
export async function readIsClaimable(
  vaultId: string,
  options: ReadOptions = {},
): Promise<boolean> {
  const native = await simulateRead(
    HEIRVAULT_METHODS.isClaimable,
    [u64ScVal(u64FromDecimalString(vaultId))],
    options,
  );
  return native === true;
}

/** Read the total allocation of a vault via `get_total_allocation`. */
export async function readTotalAllocation(
  vaultId: string,
  options: ReadOptions = {},
): Promise<number> {
  const native = await simulateRead(
    HEIRVAULT_METHODS.getTotalAllocation,
    [u64ScVal(u64FromDecimalString(vaultId))],
    options,
  );
  return Number(readBigInt(native, "get_total_allocation"));
}

/**
 * Read the vault count via `get_vault_count`.
 *
 * The contract returns `u64`, which `scValToNative` decodes as a `bigint` —
 * normalise it here so callers never have to know that.
 */
export async function readVaultCount(
  options: ReadOptions = {},
): Promise<number> {
  const native = await simulateRead(HEIRVAULT_METHODS.getVaultCount, [], options);
  return Number(readBigInt(native, "get_vault_count"));
}

/** Read the schema version via `schema_version` (`u32`). */
export async function readSchemaVersion(
  options: ReadOptions = {},
): Promise<number> {
  const native = await simulateRead(HEIRVAULT_METHODS.schemaVersion, [], options);
  return Number(readBigInt(native, "schema_version"));
}

// ---------------------------------------------------------------------------
// Contract → domain bridge
// ---------------------------------------------------------------------------

/** Frontend trigger → contract `ActivationMode`. */
export function activationModeFromTrigger(trigger: ActivationTrigger): ActivationModeValue {
  switch (trigger) {
    case "missed-check-in":
      return "MissedCheckIn";
    case "guardian-approval":
      return "GuardianApproval";
    case "multi-condition":
      return "MultiCondition";
    default:
      throw new ContractReadError(`Unsupported activation trigger ${JSON.stringify(trigger)}.`);
  }
}

/** Contract `ActivationMode` → frontend trigger. */
export function triggerFromActivationMode(mode: ActivationModeValue): ActivationTrigger {
  switch (mode) {
    case "MissedCheckIn":
      return "missed-check-in";
    case "GuardianApproval":
      return "guardian-approval";
    case "MultiCondition":
      return "multi-condition";
    default:
      throw new ContractReadError(`Unknown activation mode ${JSON.stringify(mode)}.`);
  }
}

/**
 * Extract the numeric vault id returned by a confirmed `create_vault` call.
 *
 * The contract returns `u64`; the SDK decodes it as a `bigint`. Anything else
 * is a decoding failure and is reported as such rather than guessed at.
 */
export function readVaultIdFromReturnValue(value: xdr.ScVal | undefined): string {
  if (!value) {
    throw new ContractReadError(
      "The create_vault transaction was confirmed but returned no vault id.",
    );
  }
  let native: unknown;
  try {
    native = scValToNative(value);
  } catch (decodeError) {
    throw new ContractReadError(
      `Could not decode the create_vault return value: ${
        decodeError instanceof Error ? decodeError.message : String(decodeError)
      }`,
    );
  }
  if (typeof native === "bigint" || typeof native === "number") {
    const id = BigInt(native).toString();
    if (/^\d+$/.test(id)) return id;
  }
  if (typeof native === "string" && /^\d+$/.test(native)) return native;
  throw new ContractReadError(
    `Expected create_vault to return a numeric vault id, received ${JSON.stringify(String(native))}.`,
  );
}

/**
 * Turn a decoded `get_vault` result into the frontend's domain {@link Vault}.
 *
 * Chain state is authoritative for everything the contract stores. `local` is
 * the record this app persisted for the same vault id, and only supplies what
 * the contract deliberately does not store: name, description, address labels,
 * guardian roles and the history of transactions *this app* submitted.
 */
export function toDomainVault(
  info: DecodedVaultInfo,
  claimRecords: DecodedClaimRecord[],
  local: Vault | null | undefined,
  context: VaultDecodeContext,
): Vault {
  const chain = info.vault;
  const status = toAppVaultStatus(info.effectiveStatus);

  const beneficiaries: Beneficiary[] = chain.beneficiaries.map((beneficiary) => {
    const meta = local?.beneficiaries?.find((entry) => entry.address === beneficiary.address);
    return {
      ...beneficiary,
      label: meta?.label,
      relationship: meta?.relationship,
      email: meta?.email,
    };
  });

  const guardians: Guardian[] = chain.guardians.map((guardian) => {
    const meta = local?.guardians?.find((entry) => entry.address === guardian.address);
    return {
      ...guardian,
      label: meta?.label,
      role: meta?.role ?? guardian.role,
    };
  });

  const activeAddresses = new Set(beneficiaries.map((entry) => entry.address));
  const claims: BeneficiaryClaim[] = claimRecords
    // Deactivated slots can never claim, so they are not shown as claimable.
    .filter((record) => activeAddresses.has(record.beneficiary))
    .map((record) => {
    const localClaim = local?.claims?.find((entry) => entry.address === record.beneficiary);
    const beneficiary = beneficiaries.find((entry) => entry.address === record.beneficiary);
    const settled = status === "triggered" || status === "completed";
    return {
      beneficiaryId: beneficiary?.id ?? record.beneficiary,
      address: record.beneficiary,
      status: record.claimed ? "claimed" : settled ? "available" : "not-eligible",
      claimTxHash: localClaim?.claimTxHash,
      claimedAt: localClaim?.claimedAt,
    };
  });

  return {
    id: chain.id,
    contractId: context.contractId ?? undefined,
    owner: chain.owner,
    name: local?.name ?? `Vault #${chain.id}`,
    description: local?.description,
    status,
    network: context.network,
    createdAt: chain.createdAt,
    asset: {
      contractId: chain.assetContractId,
      symbol: context.assetSymbol,
      decimals: context.assetDecimals,
      amount: fromBaseUnits(BigInt(chain.balance), context.assetDecimals),
    },
    beneficiaries,
    guardians,
    activation: {
      trigger: triggerFromActivationMode(chain.activationMode),
      // The contract stores seconds; this app always writes whole days, so the
      // read-back is rounded to the nearest day for display.
      checkInIntervalDays: Math.max(1, Math.round(chain.checkInPeriodSeconds / 86_400)),
      gracePeriodDays: Math.max(1, Math.round(chain.gracePeriodSeconds / 86_400)),
      guardianThreshold: chain.guardianThreshold,
    },
    activationApprovals: guardians
      .filter((guardian) => guardian.approvalStatus === "approved")
      .map((guardian) => guardian.address),
    lastCheckInAt: chain.lastCheckInAt,
    nextCheckInDueAt: info.deadline,
    activatedAt: chain.activatedAt ?? undefined,
    cancelledAt: status === "cancelled" ? chain.lastStatusChangeAt : undefined,
    completedAt: status === "completed" ? chain.lastStatusChangeAt : undefined,
    // The contract exposes no history entrypoint, so the on-chain vault starts
    // with an empty history and only records transactions this app submitted.
    transactions: local?.transactions ?? [],
    claims,
  };
}

/** Convenience wrapper: read one vault from the contract into the domain. */
export async function readDomainVault(
  vaultId: string,
  local: Vault | null | undefined,
  options: ReadOptions = {},
): Promise<Vault> {
  const [info, claims] = await Promise.all([
    readVaultInfo(vaultId, options),
    readClaims(vaultId, options),
  ]);
  return toDomainVault(info, claims, local, contextFor(options));
}
