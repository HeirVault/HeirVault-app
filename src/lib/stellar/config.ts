/**
 * Contract configuration.
 *
 * Deliberately free of any `@stellar/stellar-sdk` import: this module is used
 * by layout, banners and static pages, so it must stay cheap to bundle. The SDK
 * lives in `contract.ts`, which is only loaded when a blockchain action runs.
 */

import { isValidContractId as isValidContractIdStrKey } from "@/lib/vault/strkey";

import { getNetworkConfig, type StellarNetworkConfig } from "./network";

/** Raised whenever a blockchain action is attempted without a contract id. */
export class ContractNotConfiguredError extends Error {
  constructor(
    message = "NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID is not configured.",
  ) {
    super(message);
    this.name = "ContractNotConfiguredError";
  }
}

export interface ContractConfig {
  contractId: string | null;
  assetContractId: string | null;
  assetSymbol: string;
  assetDecimals: number;
  network: StellarNetworkConfig;
}

/** Read the configured contract/asset identifiers from the environment. */
export function getContractConfig(): ContractConfig {
  const network = getNetworkConfig();
  const contractId = process.env.NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID?.trim() || null;
  const assetContractId = process.env.NEXT_PUBLIC_USDC_CONTRACT_ID?.trim() || null;
  const symbol = process.env.NEXT_PUBLIC_USDC_SYMBOL?.trim() || "USDC";
  const decimalsRaw = process.env.NEXT_PUBLIC_USDC_DECIMALS?.trim();
  const decimals = decimalsRaw ? Number.parseInt(decimalsRaw, 10) : 7;

  return {
    contractId,
    assetContractId,
    assetSymbol: symbol,
    assetDecimals: Number.isFinite(decimals) ? decimals : 7,
    network,
  };
}

/**
 * Everything that is *wrong* with the current environment configuration.
 *
 * An empty array means the configured identifiers are structurally valid — it
 * is not a claim that the contract exists on the selected network; only a
 * simulated read can establish that.
 */
export function getContractConfigProblems(): string[] {
  const problems: string[] = [];
  const { contractId, assetContractId } = getContractConfig();

  if (contractId && !isValidContractIdStrKey(contractId)) {
    problems.push(
      `NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID (${contractId}) is not a valid Soroban contract id — it must be a C… string with a correct checksum.`,
    );
  }

  if (assetContractId && !isValidContractIdStrKey(assetContractId)) {
    problems.push(
      `NEXT_PUBLIC_USDC_CONTRACT_ID (${assetContractId}) is not a valid Soroban contract id — it must be a C… string with a correct checksum.`,
    );
  }

  // Checked against the raw value: `getContractConfig` silently falls back to 7
  // for an unparsable input, which would otherwise hide the misconfiguration.
  const decimalsRaw = process.env.NEXT_PUBLIC_USDC_DECIMALS?.trim();
  if (decimalsRaw && (!/^\d+$/.test(decimalsRaw) || Number(decimalsRaw) > 18)) {
    problems.push(
      `NEXT_PUBLIC_USDC_DECIMALS (${decimalsRaw}) must be an integer between 0 and 18.`,
    );
  }

  if (!assetContractId && contractId) {
    problems.push(
      "NEXT_PUBLIC_USDC_CONTRACT_ID is not set, so vaults cannot be created or funded against the configured contract.",
    );
  }

  return problems;
}

/**
 * Whether blockchain *writes* are possible.
 *
 * The UI uses this to render a persistent "contract not configured" banner and
 * to disable deploy/claim actions instead of pretending they succeeded. An id
 * that is present but malformed counts as not configured — see
 * {@link getContractConfigProblems} for the specific reason.
 */
export function isContractConfigured(): boolean {
  const { contractId } = getContractConfig();
  return contractId !== null && isValidContractIdStrKey(contractId);
}

/** Throws unless a real, structurally valid contract id is configured. */
export function requireContractId(): string {
  const { contractId } = getContractConfig();
  if (!contractId) {
    throw new ContractNotConfiguredError(
      "No HeirVault contract is configured for this environment. Set " +
        "NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID to a deployed contract id before " +
        "attempting on-chain actions.",
    );
  }
  if (!isValidContractIdStrKey(contractId)) {
    throw new ContractNotConfiguredError(
      `NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID (${contractId}) is not a valid Soroban contract id.`,
    );
  }
  return contractId;
}

export interface SupportedAsset {
  contractId: string;
  symbol: string;
  decimals: number;
  label: string;
}

/**
 * Assets this deployment supports, derived entirely from environment config.
 * Returns an empty list (never a fabricated asset) when none is configured.
 */
export function getSupportedAssets(): SupportedAsset[] {
  const config = getContractConfig();
  if (!config.assetContractId) return [];
  return [
    {
      contractId: config.assetContractId,
      symbol: config.assetSymbol,
      decimals: config.assetDecimals,
      label: config.assetSymbol,
    },
  ];
}
