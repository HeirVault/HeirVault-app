"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { BeneficiaryList } from "@/components/beneficiaries/BeneficiaryList";
import { StatusBanners } from "@/components/layout/StatusBanners";
import { WalletGate } from "@/components/wallet/WalletGate";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SelectField } from "@/components/ui/Field";
import { useVault } from "@/hooks/useVault";
import { useWallet } from "@/hooks/useWallet";
import { deriveClaimStatus } from "@/lib/vault/calculations";
import type { ClaimStatus } from "@/lib/vault/types";

export default function BeneficiariesPage() {
  const { vaults, loading, isDevelopmentData } = useVault();
  const { address } = useWallet();
  const [selectedId, setSelectedId] = useState<string>("");

  const ownedVaults = useMemo(() => {
    if (!address) return vaults;
    const mine = vaults.filter((vault) => vault.owner === address);
    return mine.length > 0 ? mine : vaults;
  }, [address, vaults]);

  const selected = ownedVaults.find((vault) => vault.id === selectedId) ?? ownedVaults[0];

  const options = ownedVaults.map((vault) => ({
    value: vault.id,
    label: `${vault.name} · ${vault.beneficiaries.length} heir(s)`,
  }));

  const claimStatuses = selected
    ? selected.beneficiaries.reduce<Record<string, ClaimStatus>>((accumulator, beneficiary) => {
        accumulator[beneficiary.address] = deriveClaimStatus(selected, beneficiary.address);
        return accumulator;
      }, {})
    : {};

  return (
    <div className="hv-container space-y-8 py-10">
      <PageHeader
        eyebrow="Beneficiaries"
        title="Manage your heirs"
        description="Review who receives what across your vaults. Beneficiary sets are stored on-chain, so edits are submitted as contract calls."
      />

      <StatusBanners className="space-y-3" />

      <WalletGate description="Beneficiary management is scoped to the vaults your wallet owns.">
        {loading ? (
          <Card>
            <CardBody>
              <p className="text-sm text-muted">Loading your vaults…</p>
            </CardBody>
          </Card>
        ) : ownedVaults.length === 0 ? (
          <EmptyState
            title="No vaults to manage"
            description="Create a vault first — beneficiaries are configured as part of the vault."
            action={
              <Link
                href="/vault/new"
                className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
              >
                Create a vault
              </Link>
            }
          />
        ) : (
          <div className="space-y-6">
            {isDevelopmentData && (
              <Alert tone="warning" title="Development fixtures">
                These beneficiaries belong to local fixtures, not to your wallet. Editing them against a live
                contract requires a deployed HeirVault contract.
              </Alert>
            )}

            <SelectField
              label="Vault"
              value={selected?.id ?? ""}
              options={options}
              onChange={(event) => setSelectedId(event.target.value)}
              containerClassName="max-w-md"
            />

            {selected && (
              <Card>
                <CardHeader
                  title={`${selected.beneficiaries.length} beneficiary(ies)`}
                  description="Total allocation must remain exactly 100%. Allocation changes require a contract call."
                  action={
                    <Link href={`/vault/${selected.id}`} className="hv-link text-sm">
                      Open vault
                    </Link>
                  }
                />
                <CardBody className="space-y-4">
                  <BeneficiaryList vault={selected} claimStatuses={claimStatuses} />
                  <Alert tone="neutral" title="Editing beneficiaries">
                    The HeirVault contract exposes <code className="font-mono">update_beneficiaries</code> with
                    the same 100% invariant enforced on-chain. This build validates the set locally and submits
                    the call through the contract boundary; it does not edit vault state locally.
                  </Alert>
                </CardBody>
              </Card>
            )}
          </div>
        )}
      </WalletGate>
    </div>
  );
}
