"use client";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Table, type Column } from "@/components/ui/Table";
import { formatDateTime, truncateMiddle } from "@/lib/format";
import { getTransactionUrl, isExplorableHash } from "@/lib/stellar/explorer";
import type { VaultTransaction, VaultTransactionType } from "@/lib/vault/types";

const TYPE_LABELS: Record<VaultTransactionType, string> = {
  deploy: "Deploy",
  deposit: "Deposit",
  "check-in": "Check-in",
  "beneficiary-update": "Beneficiaries updated",
  "guardian-update": "Guardians updated",
  "guardian-approval": "Guardian approval",
  activation: "Activation",
  claim: "Claim",
  cancel: "Cancellation",
};

export function TransactionHistoryTable({ transactions }: { transactions: VaultTransaction[] }) {
  const columns: Column<VaultTransaction>[] = [
    { key: "type", header: "Event", render: (tx) => TYPE_LABELS[tx.type] },
    { key: "when", header: "When", render: (tx) => formatDateTime(tx.timestamp) },
    {
      key: "status",
      header: "Status",
      render: (tx) => (
        <Badge tone={tx.status === "success" ? "success" : tx.status === "pending" ? "warning" : "danger"}>
          {tx.status}
        </Badge>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (tx) => (tx.amount && tx.amount !== "0" ? tx.amount : "—"),
    },
    {
      key: "hash",
      header: "Transaction",
      align: "right",
      render: (tx) => {
        const url = getTransactionUrl(tx.hash);
        if (url) {
          return (
            <a href={url} target="_blank" rel="noreferrer" className="hv-link font-mono text-xs">
              {truncateMiddle(tx.hash, 6)}
            </a>
          );
        }
        if (isExplorableHash(tx.hash)) {
          return <span className="font-mono text-xs text-muted">{truncateMiddle(tx.hash, 6)}</span>;
        }
        return (
          <span className="text-xs italic text-muted" title="Recorded by local development fixtures">
            dev fixture
          </span>
        );
      },
    },
  ];

  return (
    <Card>
      <CardHeader title="Transaction history" description="Every recorded vault event, newest last." />
      <CardBody>
        <Table
          columns={columns}
          rows={transactions}
          rowKey={(tx) => tx.hash}
          caption="Vault transaction history"
          emptyMessage="No transactions have been recorded for this vault yet."
        />
      </CardBody>
    </Card>
  );
}
