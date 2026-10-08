"use client";

import { Alert } from "@/components/ui/Alert";
import { useVault } from "@/hooks/useVault";
import { getContractConfig } from "@/lib/stellar/contract";

/**
 * Makes the environment's state explicit:
 *  - whether the data on screen is development fixtures;
 *  - whether a real contract is configured (i.e. whether writes are possible).
 *
 * These banners exist so nothing in the UI can be mistaken for live chain data.
 */
export function StatusBanners({ className }: { className?: string }) {
  const { isDevelopmentData, contractConfigured } = useVault();
  const config = getContractConfig();

  return (
    <div className={className}>
      {isDevelopmentData && (
        <Alert tone="warning" title="Development data">
          These vaults are local fixtures for UI development. They are not on-chain, and no transaction you
          see here was submitted to Stellar.
        </Alert>
      )}

      {!contractConfigured && (
        <Alert tone="neutral" title="Soroban contract not configured">
          Set <code className="font-mono">NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID</code> to a deployed HeirVault
          contract to enable deposits, check-ins, activation and claims. Until then those actions will report
          &ldquo;contract not configured&rdquo; — never a fake success.
        </Alert>
      )}

      {contractConfigured && (
        <Alert tone="info" title={`Connected to ${config.network.label}`}>
          Contract <span className="font-mono">{config.contractId}</span> · RPC{" "}
          <span className="font-mono">{config.network.rpcUrl}</span>
        </Alert>
      )}
    </div>
  );
}
