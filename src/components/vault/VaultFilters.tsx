"use client";

import { useMemo } from "react";

import { cn } from "@/lib/cn";
import { deriveVaultState } from "@/lib/vault/calculations";
import { VAULT_STATUS_META, type Vault, type VaultStatus } from "@/lib/vault/types";

export type VaultGroup = "all" | "active" | "triggered" | "completed" | "cancelled" | "draft";

export const VAULT_GROUPS: VaultGroup[] = ["all", "active", "triggered", "completed", "cancelled", "draft"];

const GROUP_LABELS: Record<VaultGroup, string> = {
  all: "All",
  active: "Active",
  triggered: "Triggered",
  completed: "Completed",
  cancelled: "Cancelled",
  draft: "Drafts",
};

/** Which derived statuses belong to each dashboard group. */
function matchesGroup(status: VaultStatus, group: VaultGroup): boolean {
  if (group === "all") return true;
  if (group === "active") return status === "active" || status === "grace";
  return status === group;
}

export function groupVaults(vaults: Vault[], group: VaultGroup, now = new Date()): Vault[] {
  if (group === "all") return vaults;
  return vaults.filter((vault) => matchesGroup(deriveVaultState(vault, now).status, group));
}

export function countByGroup(vaults: Vault[], now = new Date()): Record<VaultGroup, number> {
  return VAULT_GROUPS.reduce(
    (counts, group) => {
      counts[group] = group === "all" ? vaults.length : groupVaults(vaults, group, now).length;
      return counts;
    },
    {} as Record<VaultGroup, number>,
  );
}

export interface VaultFiltersProps {
  value: VaultGroup;
  onChange: (group: VaultGroup) => void;
  vaults: Vault[];
  className?: string;
}

export function VaultFilters({ value, onChange, vaults, className }: VaultFiltersProps) {
  const counts = useMemo(() => countByGroup(vaults), [vaults]);

  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="tablist" aria-label="Filter vaults by status">
      {VAULT_GROUPS.map((group) => {
        const selected = value === group;
        const hint =
          group === "all" || group === "draft"
            ? ""
            : ` · ${VAULT_STATUS_META[group as VaultStatus].description}`;
        return (
          <button
            key={group}
            type="button"
            role="tab"
            aria-selected={selected}
            title={hint || undefined}
            onClick={() => onChange(group)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition",
              selected
                ? "border-brand-500 bg-brand-50 text-brand-800"
                : "border-border bg-surface text-content hover:border-brand-300",
            )}
          >
            {GROUP_LABELS[group]}
            <span className="ml-1.5 text-muted">{counts[group]}</span>
          </button>
        );
      })}
    </div>
  );
}
