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

import { Address, Contract, nativeToScVal, xdr } from "@stellar/stellar-sdk";

import { toBaseUnits } from "@/lib/vault/calculations";
import type { ActivationConditions, Beneficiary, Guardian } from "@/lib/vault/types";

import {
  ContractNotConfiguredError,
  getContractConfig,
  getSupportedAssets,
  isContractConfigured,
  requireContractId,
  type ContractConfig,
  type SupportedAsset,
} from "./config";

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
