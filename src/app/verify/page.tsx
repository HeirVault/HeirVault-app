"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusBanners } from "@/components/layout/StatusBanners";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InputField } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { VaultStatusBadge } from "@/components/vault/VaultStatusBadge";
import { useVault } from "@/hooks/useVault";
import { deriveVaultState } from "@/lib/vault/calculations";
import { formatDate } from "@/lib/format";

export default function VerifyIndexPage() {
  const { vaults, loading } = useVault();
  const [query, setQuery] = useState("");
  const [notFoundId, setNotFoundId] = useState<string | null>(null);

  function lookup(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    const match = vaults.find((vault) => vault.id === trimmed);
    if (match) {
      window.location.assign(`/verify/${encodeURIComponent(match.id)}`);
      return;
    }
    setNotFoundId(trimmed);
  }

  return (
    <div className="hv-container space-y-8 py-10">
      <PageHeader
        eyebrow="Public verification"
        title="Verify an inheritance vault"
        description="Inspect any vault's public state without connecting a wallet. Enter a vault identifier to open its verification page."
      />

      <StatusBanners className="space-y-3" />

      <Card>
        <CardHeader title="Look up a vault" description="Vault identifiers are shared by the vault owner." />
        <CardBody>
          <form onSubmit={lookup} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <InputField
              label="Vault identifier"
              placeholder="e.g. vault_4f9c…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setNotFoundId(null);
              }}
              containerClassName="flex-1"
            />
            <Button type="submit">Open verification</Button>
          </form>

          {notFoundId && (
            <Alert tone="danger" className="mt-4" title="Vault not found">
              No vault matching <span className="font-mono">{notFoundId}</span> is available in this
              environment.
            </Alert>
          )}
        </CardBody>
      </Card>

      <section aria-labelledby="known-vaults" className="space-y-4">
        <h2 id="known-vaults" className="text-lg font-semibold text-content-strong">
          Vaults readable in this environment
        </h2>

        {loading ? (
          <p className="text-sm text-muted" aria-busy="true">
            Loading vaults…
          </p>
        ) : vaults.length === 0 ? (
          <EmptyState
            title="No vaults available to verify"
            description="Once a vault exists in this environment it will be listed here for public verification."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vaults.map((vault) => {
              const state = deriveVaultState(vault);
              return (
                <li key={vault.id}>
                  <Card className="h-full">
                    <CardBody className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-content-strong">{vault.name}</p>
                          <p className="mt-0.5 font-mono text-xs text-muted">{vault.id}</p>
                        </div>
                        <VaultStatusBadge status={state.status} />
                      </div>
                      <p className="text-xs text-muted">Created {formatDate(vault.createdAt)}</p>
                      <Link href={`/verify/${vault.id}`} className="hv-link text-sm">
                        Verify this vault →
                      </Link>
                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
