/**
 * HeirVault SDK adapter.
 *
 * The frontend's single connection point to the `heirvault-sdk` package. It
 * translates this app's environment configuration and wallet adapter into the
 * SDK's `HeirVaultClient`, so no other frontend module needs to know how a
 * client is configured or how a wallet signature is obtained.
 *
 * Reusable blockchain logic (contract ABI encoding, the transaction lifecycle,
 * value decoding, amount maths) lives in the SDK. Presentation metadata and
 * app-specific overlays stay in the frontend.
 */

import {
  HeirVaultClient,
  callbackSigner,
  type NetworkConfig,
  type WalletSigner,
} from "heirvault-sdk";

import { getContractConfig, requireContractId } from "@/lib/stellar/config";
import { getNetworkConfig } from "@/lib/stellar/network";

/** Map this app's network config onto the SDK's `NetworkConfig` shape. */
export function sdkNetwork(): NetworkConfig {
  const network = getNetworkConfig();
  return {
    id: network.id,
    label: network.label,
    rpcUrl: network.rpcUrl,
    horizonUrl: network.horizonUrl,
    passphrase: network.passphrase,
    explorerBaseUrl: network.explorerBaseUrl,
    isMainnet: network.isMainnet,
  };
}

/** Wrap the connected wallet's `sign` callback as an SDK `WalletSigner`. */
export function walletSigner(address: string, sign: (envelopeXdr: string) => Promise<string>): WalletSigner {
  return callbackSigner(address, (envelopeXdr) => sign(envelopeXdr));
}

export interface CreateSdkClientOptions {
  /** Connected wallet address (enables writes and owner-scoped reads). */
  address?: string;
  /** Wallet signing callback; required for writes. */
  sign?: (envelopeXdr: string) => Promise<string>;
}

/**
 * Build a configured {@link HeirVaultClient}.
 *
 * Throws {@link ContractNotConfiguredError} (from `@/lib/stellar/config`) when
 * no contract id is configured, so callers keep their existing not-configured
 * handling.
 */
export function createSdkClient(options: CreateSdkClientOptions = {}): HeirVaultClient {
  const contractId = requireContractId();
  const config = getContractConfig();
  const signer = options.address && options.sign ? walletSigner(options.address, options.sign) : undefined;

  return new HeirVaultClient({
    contractId,
    network: sdkNetwork(),
    ...(signer ? { signer } : {}),
    ...(options.address ? { readSourceAddress: options.address } : {}),
    asset: config.assetContractId
      ? { contractId: config.assetContractId, symbol: config.assetSymbol, decimals: config.assetDecimals }
      : { decimals: config.assetDecimals },
  });
}

// Re-export the SDK helpers the frontend uses, so there is a single import
// surface and the SDK remains the source of truth for these behaviours.
export {
  toBaseUnits,
  fromBaseUnits,
  applyBps,
  bpsToPercent,
  percentToBps,
  formatAllocation,
  totalAllocationBps,
  parseVaultId,
  ACTIVATION_MODES,
  VAULT_STATUSES,
  BPS_DENOMINATOR,
  FULL_ALLOCATION_BPS,
  MAX_BENEFICIARIES,
  MAX_GUARDIANS,
  MAX_PAGE_LIMIT,
  MIN_CHECK_IN_PERIOD,
  MIN_GRACE_PERIOD,
  SCHEMA_VERSION,
  HeirVaultContractError,
  SimulationError,
  TransactionFailedError,
  ConfirmationTimeoutError,
  WalletRejectedError,
  SignerNotConfiguredError,
  InvalidArgumentError,
  HeirVaultSdkError,
  heirVaultErrorName,
} from "heirvault-sdk";

export type {
  ActivationMode,
  Vault as SdkVault,
  Beneficiary as SdkBeneficiary,
  Guardian as SdkGuardian,
  ClaimRecord as SdkClaimRecord,
  VaultSummary as SdkVaultSummary,
  Deadlines as SdkDeadlines,
  GuardianStatus as SdkGuardianStatus,
  TransactionPhase as SdkTransactionPhase,
  VaultId,
  TokenAmount,
} from "heirvault-sdk";
