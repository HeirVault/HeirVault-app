"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { BeneficiaryList } from "@/components/beneficiaries/BeneficiaryList";
import { ClaimPanel } from "@/components/claims/ClaimPanel";
import { StatusBanners } from "@/components/layout/StatusBanners";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { ActivationConditionsPanel } from "@/components/vault/ActivationConditionsPanel";
import { VaultStatusBadge } from "@/components/vault/VaultStatusBadge";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useVaultById } from "@/hooks/useVault";
import { useWallet } from "@/hooks/useWallet";
import { deriveClaimStatus } from "@/lib/vault/calculations";
import type { ClaimStatus } from "@/lib/vault/types";

export default function InheritPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { vault, state, loading, notFound } = useVaultById(id);
  const { address } = useWallet();

  const myBeneficiary = useMemo(
    () => vault?.beneficiaries.find((beneficiary) => beneficiary.address === address),
    [address, vault],
  );

  const claimStatuses = useMemo(() => {
    if (!vault) return {} as Record<string, ClaimStatus>;
    return vault.beneficiaries.reduce<Record<string, ClaimStatus>>((accumulator, beneficiary) => {
      accumulator[beneficiary.address] = deriveClaimStatus(vault, beneficiary.address);
      return accumulator;
    }, {});
  }, [vault]);

  if (loading && !vault) {
    return (
      <div className="hv-container space-y-6 py-10" aria-busy="true">
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (!vault || !state) {
    return (
      <div className="hv-container py-16">
        <EmptyState
          title="Inheritance vault not found"
          description={
            notFound
              ? `No vault with the id "${id}" exists in this environment. Double-check the link you were given.`
              : "The vault could not be loaded. Try refreshing the page."
          }
          action={
            <Link
              href="/verify"
              className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Verify a vault
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="hv-container space-y-8 py-10">
      <PageHeader
        eyebrow="Inheritance"
        title={vault.name}
        description="If you are a named beneficiary, this page shows what you are entitled to and whether the vault permits a claim."
        actions={
          <>
            <VaultStatusBadge status={state.status} />
            <Link
              href={`/verify/${vault.id}`}
              className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-content-strong transition hover:border-brand-300"
            >
              Public verification
            </Link>
          </>
        }
      />

      <StatusBanners className="space-y-3" />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {myBeneficiary ? (
            <ClaimPanel vault={vault} beneficiary={myBeneficiary} />
          ) : (
            <Card>
              <CardHeader
                title="Are you a beneficiary?"
                description="Connect the Stellar wallet that was named in this vault to see your allocation and claim it."
              />
              <CardBody className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <ConnectWalletButton />
                  {address && (
                    <span className="text-xs text-muted">
                      Connected as <span className="font-mono">{address}</span> — not a beneficiary of this
                      vault.
                    </span>
                  )}
                </div>
                <Alert tone="neutral">
                  Claim eligibility below is derived from the vault&rsquo;s public activation state. The
                  contract remains the final authority.
                </Alert>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Beneficiaries"
              description="Every named heir and the share they are entitled to."
            />
            <CardBody>
              <BeneficiaryList vault={vault} claimStatuses={claimStatuses} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <ActivationConditionsPanel
            activation={vault.activation}
            activatedAt={vault.activatedAt}
            guardianApprovals={vault.activationApprovals.length}
            guardianCount={vault.guardians.length}
          />
        </div>
      </div>
    </div>
  );
}
