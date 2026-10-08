"use client";

import { useMemo } from "react";

import { Stat } from "@/components/ui/Stat";
import { deriveVaultState } from "@/lib/vault/calculations";
import { formatNumber } from "@/lib/format";
import type { Vault } from "@/lib/vault/types";

export interface DashboardStatsProps {
  vaults: Vault[];
}

export function DashboardStats({ vaults }: DashboardStatsProps) {
  const summary = useMemo(() => {
    const now = new Date();
    let protectedAssets = 0;
    let beneficiaries = 0;
    let active = 0;
    let triggered = 0;
    let needsCheckIn = 0;

    for (const vault of vaults) {
      const state = deriveVaultState(vault, now);
      if (state.status !== "cancelled" && state.status !== "draft") {
        const amount = Number(vault.asset.amount);
        if (Number.isFinite(amount)) protectedAssets += amount;
      }
      beneficiaries += vault.beneficiaries.length;
      if (state.status === "active" || state.status === "grace") active += 1;
      if (state.status === "triggered") triggered += 1;
      if (state.checkInOverdue && state.status !== "triggered" && state.status !== "cancelled") {
        needsCheckIn += 1;
      }
    }

    return { protectedAssets, beneficiaries, active, triggered, needsCheckIn };
  }, [vaults]);

  const symbol = vaults[0]?.asset.symbol ?? "USDC";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Protected assets"
        value={`${formatNumber(summary.protectedAssets, 2)} ${symbol}`}
        hint="Total value held across your vaults"
      />
      <Stat label="Active vaults" value={summary.active} hint={`${summary.triggered} triggered`} />
      <Stat label="Beneficiaries" value={summary.beneficiaries} hint="Across all vaults" />
      <Stat
        label="Needs check-in"
        value={summary.needsCheckIn}
        hint={summary.needsCheckIn > 0 ? "Overdue — grace period running" : "All up to date"}
      />
    </div>
  );
}
