"use client";

import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { Badge } from "@/components/ui/Badge";
import { Table, type Column } from "@/components/ui/Table";
import { beneficiaryAmount, formatAllocation } from "@/lib/vault/calculations";
import { formatAssetAmount } from "@/lib/format";
import type { Beneficiary, ClaimStatus, Vault } from "@/lib/vault/types";

const CLAIM_TONES: Record<ClaimStatus, "neutral" | "warning" | "success" | "info" | "danger"> = {
  "not-eligible": "neutral",
  pending: "warning",
  available: "success",
  claimed: "info",
  expired: "danger",
};

const CLAIM_LABELS: Record<ClaimStatus, string> = {
  "not-eligible": "Not yet eligible",
  pending: "Pending",
  available: "Claim available",
  claimed: "Claimed",
  expired: "Expired",
};

export interface BeneficiaryListProps {
  vault: Vault;
  /** Optional per-address claim status map for the claim column. */
  claimStatuses?: Record<string, ClaimStatus>;
  emptyMessage?: string;
}

export function BeneficiaryList({
  vault,
  claimStatuses,
  emptyMessage = "No beneficiaries configured.",
}: BeneficiaryListProps) {
  const columns: Column<Beneficiary>[] = [
    {
      key: "beneficiary",
      header: "Beneficiary",
      render: (beneficiary) => (
        <div className="space-y-1">
          {beneficiary.label && (
            <p className="text-sm font-medium text-content-strong">{beneficiary.label}</p>
          )}
          <AddressDisplay address={beneficiary.address} />
          {beneficiary.relationship && (
            <p className="text-xs text-muted">{beneficiary.relationship}</p>
          )}
        </div>
      ),
    },
    {
      key: "share",
      header: "Share",
      align: "right",
      render: (beneficiary) => (
        <span className="font-medium text-content-strong">{formatAllocation(beneficiary.allocationBps)}</span>
      ),
    },
    {
      key: "amount",
      header: "Allocated",
      align: "right",
      render: (beneficiary) =>
        formatAssetAmount(
          beneficiaryAmount(vault.asset.amount, beneficiary.allocationBps, vault.asset.decimals),
          vault.asset.symbol,
          vault.asset.decimals,
        ),
    },
  ];

  if (claimStatuses) {
    columns.push({
      key: "claim",
      header: "Claim",
      align: "right",
      render: (beneficiary) => {
        const status = claimStatuses[beneficiary.address] ?? "not-eligible";
        return <Badge tone={CLAIM_TONES[status]}>{CLAIM_LABELS[status]}</Badge>;
      },
    });
  }

  return (
    <Table
      columns={columns}
      rows={vault.beneficiaries}
      rowKey={(beneficiary) => beneficiary.id}
      caption="Beneficiaries and allocations"
      emptyMessage={emptyMessage}
    />
  );
}
