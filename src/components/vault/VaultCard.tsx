"use client";

import Link from "next/link";
import { useMemo } from "react";

import { formatAssetAmount, formatDate, pluralise } from "@/lib/format";
import { deriveVaultState } from "@/lib/vault/calculations";
import type { Vault } from "@/lib/vault/types";

import { VaultStatusBadge } from "./VaultStatusBadge";

export interface VaultCardProps {
  vault: Vault;
  /** Hide the owner line (used on the public verification page). */
  showOwner?: boolean;
}

export function VaultCard({ vault, showOwner = false }: VaultCardProps) {
  const state = useMemo(() => deriveVaultState(vault), [vault]);
  const beneficiaryCount = vault.beneficiaries.length;

  return (
    <article className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-content-strong">
            <Link href={`/vault/${vault.id}`} className="hover:text-brand-700">
              {vault.name}
            </Link>
          </h3>
          <p className="mt-0.5 font-mono text-xs text-muted">{vault.id}</p>
        </div>
        <VaultStatusBadge status={state.status} />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Protected assets</dt>
          <dd className="mt-1 font-semibold text-content-strong">
            {formatAssetAmount(vault.asset.amount, vault.asset.symbol, vault.asset.decimals)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Beneficiaries</dt>
          <dd className="mt-1 font-semibold text-content-strong">
            {beneficiaryCount} {pluralise(beneficiaryCount, "heir")}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Last check-in</dt>
          <dd className="mt-1 text-content">{formatDate(vault.lastCheckInAt ?? vault.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Next check-in due</dt>
          <dd className="mt-1 text-content">{formatDate(state.nextCheckInDueAt)}</dd>
        </div>
      </dl>

      {showOwner && (
        <p className="mt-4 truncate font-mono text-xs text-muted">Owner: {vault.owner}</p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <Link
          href={`/vault/${vault.id}`}
          className="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium text-content-strong transition hover:border-brand-300 hover:text-brand-700"
        >
          Manage vault
        </Link>
        <Link
          href={`/verify/${vault.id}`}
          className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-muted transition hover:bg-surface-raised hover:text-content-strong"
        >
          Public verification →
        </Link>
      </div>
    </article>
  );
}
