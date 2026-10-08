"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { StatusBanners } from "@/components/layout/StatusBanners";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { VaultFilters, groupVaults, type VaultGroup } from "@/components/vault/VaultFilters";
import { VaultList } from "@/components/vault/VaultList";
import { useVault } from "@/hooks/useVault";
import { useWallet } from "@/hooks/useWallet";

export default function DashboardPage() {
  const { vaults, loading, error, refresh } = useVault();
  const { address, status } = useWallet();
  const [group, setGroup] = useState<VaultGroup>("all");

  const ownedVaults = useMemo(() => {
    if (!address) return vaults;
    const mine = vaults.filter((vault) => vault.owner === address);
    return mine.length > 0 ? mine : vaults;
  }, [address, vaults]);

  const filtered = useMemo(() => groupVaults(ownedVaults, group), [group, ownedVaults]);

  return (
    <div className="hv-container space-y-8 py-10">
      <PageHeader
        eyebrow="Dashboard"
        title="Your inheritance vaults"
        description="Track protected assets, check-in deadlines and the state of every vault you own."
        actions={
          <>
            <Button variant="outline" onClick={() => void refresh()} loading={loading}>
              Refresh
            </Button>
            <Link
              href="/vault/new"
              className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              New vault
            </Link>
          </>
        }
      />

      <StatusBanners className="space-y-3" />

      {status !== "connected" && (
        <Alert tone="info" title="Showing every vault in this environment">
          Connect a wallet to filter the dashboard to vaults you own. Read-only data stays available without a
          wallet.
        </Alert>
      )}

      {error && (
        <Alert tone="danger" title="Could not load vaults">
          {error}
        </Alert>
      )}

      <DashboardStats vaults={ownedVaults} />

      <section aria-labelledby="vault-list-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="vault-list-heading" className="text-lg font-semibold text-content-strong">
            Vaults
          </h2>
          <VaultFilters value={group} onChange={setGroup} vaults={ownedVaults} />
        </div>

        <VaultList
          vaults={filtered}
          loading={loading}
          emptyTitle={group === "all" ? "No vaults yet" : "Nothing in this group"}
          emptyDescription={
            group === "all"
              ? "Create an inheritance vault to define how your assets reach the people you care about."
              : "No vault currently has this status. Try another filter."
          }
          emptyAction={
            group === "all" ? (
              <Link
                href="/vault/new"
                className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
              >
                Create your first vault
              </Link>
            ) : (
              <Button variant="outline" onClick={() => setGroup("all")}>
                Show all vaults
              </Button>
            )
          }
        />
      </section>
    </div>
  );
}
