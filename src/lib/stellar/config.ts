/**
 * Contract configuration.
 *
 * Deliberately free of any `@stellar/stellar-sdk` import: this module is used
 * by layout, banners and static pages, so it must stay cheap to bundle. The SDK
 * lives in `contract.ts`, which is only loaded when a blockchain action runs.
 */

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
 * Whether blockchain *writes* are possible.
 *
 * The UI uses this to render a persistent "contract not configured" banner and
 * to disable deploy/claim actions instead of pretending they succeeded.
 */
export function isContractConfigured(): boolean {
  return getContractConfig().contractId !== null;
}

/** Throws unless a real contract id is configured. */
export function requireContractId(): string {
  const { contractId } = getContractConfig();
  if (!contractId) {
    throw new ContractNotConfiguredError(
      "No HeirVault contract is configured for this environment. Set " +
        "NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID to a deployed contract id before " +
        "attempting on-chain actions.",
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
