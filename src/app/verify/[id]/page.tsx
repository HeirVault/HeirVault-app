"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { AllocationBar } from "@/components/beneficiaries/AllocationBar";
import { StatusBanners } from "@/components/layout/StatusBanners";
import { TransactionHistoryTable } from "@/components/vault/TransactionHistoryTable";
import { VaultStatusBadge } from "@/components/vault/VaultStatusBadge";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useVaultById } from "@/hooks/useVault";
import { formatAllocation, deriveVaultState } from "@/lib/vault/calculations";
import { formatAssetAmount, formatDate } from "@/lib/format";
import { getContractConfig } from "@/lib/stellar/contract";
import { ACTIVATION_TRIGGER_LABELS } from "@/lib/vault/types";

/**
 * Public verification page.
 *
 * Deliberately free of wallet requirements: anyone with a vault id can confirm
 * what the vault holds, who it pays, and which transactions back it.
 *
 * Privacy: only data that is already public on-chain is shown (owner address,
 * beneficiary addresses, allocations, transaction hashes). No labels, emails,
 * relationships, secrets or keys are rendered here.
 */
export default function VerifyVaultPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { vault, state, loading, notFound } = useVaultById(id);
  const config = useMemo(() => getContractConfig(), []);

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
          title="Vault not found"
          description={
            notFound
              ? `Nothing is recorded for the identifier "${id}" in this environment. Verification only shows vaults this deployment can read.`
              : "The vault could not be loaded. No verification data is available for this request."
          }
          action={
            <Link
              href="/verify"
              className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Back to verification
            </Link>
          }
        />
      </div>
    );
  }

  const derived = deriveVaultState(vault);

  return (
    <div className="hv-container space-y-8 py-10">
      <PageHeader
        eyebrow="Public verification"
        title={vault.id}
        description="Independent, wallet-free view of this vault's public state. All values are read from the configured source — nothing is simulated."
        actions={<VaultStatusBadge status={derived.status} />}
      />

      <Alert tone="neutral" title="No wallet required">
        This page never requests a wallet connection and displays only publicly available information.
      </Alert>

      <StatusBanners className="space-y-3" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Vault identifiers" />
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Vault identifier</dt>
                <dd className="mt-1 break-all font-mono text-sm text-content-strong">{vault.id}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Network</dt>
                <dd className="mt-1 text-sm text-content-strong">{config.network.label}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Contract address</dt>
                <dd className="mt-1">
                  {vault.contractId || config.contractId ? (
                    <AddressDisplay
                      address={(vault.contractId ?? config.contractId) as string}
                      kind="contract"
                    />
                  ) : (
                    <span className="text-sm text-muted">No contract configured</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Owner</dt>
                <dd className="mt-1">
                  <AddressDisplay address={vault.owner} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Created</dt>
                <dd className="mt-1 text-sm text-content-strong">{formatDate(vault.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Status</dt>
                <dd className="mt-1 text-sm text-content-strong">{derived.status}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Protected assets" />
          <CardBody>
            <p className="text-2xl font-semibold text-content-strong">
              {formatAssetAmount(vault.asset.amount, vault.asset.symbol, vault.asset.decimals)}
            </p>
            <p className="mt-2 text-xs text-muted">
              Asset contract:{" "}
              {vault.asset.contractId ? (
                <AddressDisplay address={vault.asset.contractId} kind="contract" />
              ) : (
                "not configured"
              )}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Beneficiaries</dt>
                <dd className="text-content-strong">{vault.beneficiaries.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Guardians</dt>
                <dd className="text-content-strong">{vault.guardians.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Activation</dt>
                <dd className="text-right text-content-strong">
                  {ACTIVATION_TRIGGER_LABELS[vault.activation.trigger]}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Next check-in</dt>
                <dd className="text-content-strong">{formatDate(derived.nextCheckInDueAt)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title="Beneficiary allocation"
            description="Public allocation data: address and share only. Personal notes are never published."
          />
          <CardBody className="space-y-4">
            <AllocationBar beneficiaries={vault.beneficiaries} />
            <ul className="divide-y divide-border">
              {vault.beneficiaries.map((beneficiary) => (
                <li key={beneficiary.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <AddressDisplay address={beneficiary.address} />
                  <span className="text-sm font-medium text-content-strong">
                    {formatAllocation(beneficiary.allocationBps)}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title="Activation state"
            description="What the contract requires before beneficiaries may claim."
          />
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Check-in interval</dt>
                <dd className="mt-1 text-sm text-content-strong">
                  {vault.activation.checkInIntervalDays} days
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Grace period</dt>
                <dd className="mt-1 text-sm text-content-strong">
                  {vault.activation.gracePeriodDays} days
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Guardian approvals</dt>
                <dd className="mt-1 text-sm text-content-strong">
                  {vault.activationApprovals.length} of {vault.activation.guardianThreshold} required
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Check-in overdue</dt>
                <dd className="mt-1 text-sm text-content-strong">{derived.checkInOverdue ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Grace elapsed</dt>
                <dd className="mt-1 text-sm text-content-strong">{derived.graceElapsed ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Activation eligible</dt>
                <dd className="mt-1 text-sm text-content-strong">
                  {derived.activationEligible ? "Yes" : "No"}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>

      <TransactionHistoryTable transactions={vault.transactions} />
    </div>
  );
}
