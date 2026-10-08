"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { BeneficiaryList } from "@/components/beneficiaries/BeneficiaryList";
import { GuardianApprovalPanel } from "@/components/guardians/GuardianApprovalPanel";
import { GuardianList } from "@/components/guardians/GuardianList";
import { StatusBanners } from "@/components/layout/StatusBanners";
import { ActivationConditionsPanel } from "@/components/vault/ActivationConditionsPanel";
import { CheckInPanel } from "@/components/vault/CheckInPanel";
import { DepositForm } from "@/components/vault/DepositForm";
import { TransactionHistoryTable } from "@/components/vault/TransactionHistoryTable";
import { VaultActionsPanel } from "@/components/vault/VaultActionsPanel";
import { VaultOverview } from "@/components/vault/VaultOverview";
import { VaultStatusBadge } from "@/components/vault/VaultStatusBadge";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useVaultById } from "@/hooks/useVault";
import { deriveClaimStatus } from "@/lib/vault/calculations";
import type { ClaimStatus } from "@/lib/vault/types";

export default function VaultDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { vault, state, loading, notFound } = useVaultById(id);

  if (loading && !vault) {
    return (
      <div className="hv-container space-y-6 py-10" aria-busy="true">
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonCard />
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
          title={notFound ? "Vault not found" : "Vault unavailable"}
          description={
            notFound
              ? `No vault with the id "${id}" exists in this environment. Check the link, or browse your dashboard.`
              : "The vault could not be loaded. Try refreshing the page."
          }
          action={
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Back to dashboard
            </Link>
          }
        />
      </div>
    );
  }

  const claimStatuses = vault.beneficiaries.reduce<Record<string, ClaimStatus>>((accumulator, beneficiary) => {
    accumulator[beneficiary.address] = deriveClaimStatus(vault, beneficiary.address);
    return accumulator;
  }, {});

  const guardianApprovals = vault.activationApprovals.length;

  return (
    <div className="hv-container space-y-8 py-10">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Link href="/dashboard" className="hover:underline">
              Dashboard
            </Link>
            <span aria-hidden>/</span>
            <span>Vault</span>
          </span>
        }
        title={vault.name}
        description={vault.description ?? `Vault ${vault.id}`}
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

      {state.status === "grace" && (
        <Alert tone="warning" title="Grace period running">
          A check-in was missed. If the grace period ends without a check-in, the vault activates and
          beneficiaries can claim.
        </Alert>
      )}

      {state.status === "triggered" && (
        <Alert tone="warning" title="Vault triggered">
          Activation conditions are satisfied. Beneficiaries can now claim their allocations.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <VaultOverview vault={vault} />

          <Card>
            <CardHeader
              title="Beneficiaries"
              description={`${vault.beneficiaries.length} heir(s), each with a fixed share of the vault.`}
            />
            <CardBody>
              <BeneficiaryList vault={vault} claimStatuses={claimStatuses} />
            </CardBody>
          </Card>

          <div className="grid gap-6 sm:grid-cols-2">
            <ActivationConditionsPanel
              activation={vault.activation}
              activatedAt={vault.activatedAt}
              guardianApprovals={guardianApprovals}
              guardianCount={vault.guardians.length}
            />
            <GuardianApprovalPanel
              guardians={vault.guardians}
              approvals={vault.activationApprovals}
              threshold={vault.activation.guardianThreshold}
              isActiveTrigger={vault.activation.trigger === "guardian-approval"}
            />
          </div>

          <Card>
            <CardHeader title="Guardians" description="Accounts that can approve activation." />
            <CardBody>
              <GuardianList guardians={vault.guardians} approvals={vault.activationApprovals} />
            </CardBody>
          </Card>

          <TransactionHistoryTable transactions={vault.transactions} />
        </div>

        <div className="space-y-6">
          <CheckInPanel vault={vault} state={state} />
          <DepositForm vault={vault} />
          <VaultActionsPanel vault={vault} state={state} />
        </div>
      </div>
    </div>
  );
}
