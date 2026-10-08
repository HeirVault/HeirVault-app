"use client";

import { Alert } from "@/components/ui/Alert";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatAssetAmount, formatDate } from "@/lib/format";
import { getContractConfig } from "@/lib/stellar/contract";
import type { Vault } from "@/lib/vault/types";

export function VaultOverview({ vault }: { vault: Vault }) {
  const config = getContractConfig();

  return (
    <Card>
      <CardHeader title="Vault overview" description="Identity and custody details." />
      <CardBody className="space-y-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Vault ID</dt>
            <dd className="mt-1 break-all font-mono text-sm text-content-strong">{vault.id}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Network</dt>
            <dd className="mt-1 text-sm text-content-strong">{vault.network}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Owner wallet</dt>
            <dd className="mt-1">
              <AddressDisplay address={vault.owner} />
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Contract</dt>
            <dd className="mt-1">
              {vault.contractId ? (
                <AddressDisplay address={vault.contractId} kind="contract" />
              ) : (
                <span className="text-sm text-muted">
                  {config.contractId ? "Recorded per vault after deployment" : "No contract deployed"}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Protected asset</dt>
            <dd className="mt-1 text-sm font-semibold text-content-strong">
              {formatAssetAmount(vault.asset.amount, vault.asset.symbol, vault.asset.decimals)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Created</dt>
            <dd className="mt-1 text-sm text-content-strong">{formatDate(vault.createdAt)}</dd>
          </div>
        </dl>

        {vault.description && <p className="text-sm text-content">{vault.description}</p>}

        {!config.contractId && (
          <Alert tone="neutral" title="Contract not configured">
            On-chain actions are disabled because <code className="font-mono">NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID</code>{" "}
            is not set in this environment.
          </Alert>
        )}
      </CardBody>
    </Card>
  );
}
