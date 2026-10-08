"use client";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, type Column } from "@/components/ui/Table";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { LIMITS } from "@/lib/vault/validation";
import type { Guardian, GuardianApprovalStatus, GuardianRole } from "@/lib/vault/types";

const ROLE_LABELS: Record<GuardianRole, string> = {
  primary: "Primary",
  backup: "Backup",
  arbiter: "Arbiter",
};

const STATUS_TONES: Record<GuardianApprovalStatus, BadgeTone> = {
  pending: "warning",
  approved: "success",
  declined: "danger",
  revoked: "neutral",
};

export interface GuardianListProps {
  guardians: Guardian[];
  /** Called with the guardian id when the remove button is pressed. */
  onRemove?: (id: string) => void;
  /** Guardian addresses that have approved activation. */
  approvals?: string[];
  editable?: boolean;
  emptyMessage?: string;
}

export function GuardianList({
  guardians,
  onRemove,
  approvals = [],
  editable = false,
  emptyMessage = "No guardians configured. Guardian approval activation will not be available.",
}: GuardianListProps) {
  const columns: Column<Guardian>[] = [
    {
      key: "guardian",
      header: "Guardian",
      render: (guardian) => (
        <div className="space-y-1">
          {guardian.label && <p className="text-sm font-medium text-content-strong">{guardian.label}</p>}
          <AddressDisplay address={guardian.address} showCopy={!editable} />
        </div>
      ),
    },
    { key: "role", header: "Role", render: (guardian) => ROLE_LABELS[guardian.role] },
    {
      key: "status",
      header: "Status",
      render: (guardian) => (
        <Badge tone={STATUS_TONES[guardian.approvalStatus]}>{guardian.approvalStatus}</Badge>
      ),
    },
    {
      key: "approval",
      header: "Activation approval",
      render: (guardian) =>
        approvals.includes(guardian.address) ? (
          <Badge tone="success">Approved</Badge>
        ) : (
          <Badge tone="neutral">Not yet</Badge>
        ),
    },
  ];

  if (editable && onRemove) {
    columns.push({
      key: "actions",
      header: "Actions",
      align: "right",
      render: (guardian) => (
        <Button variant="ghost" size="sm" onClick={() => onRemove(guardian.id)}>
          Remove
        </Button>
      ),
    });
  }

  return (
    <Table
      columns={columns}
      rows={guardians}
      rowKey={(guardian) => guardian.id}
      caption="Guardians"
      emptyMessage={emptyMessage}
    />
  );
}

export function guardianLimitReached(count: number): boolean {
  return count >= LIMITS.maxGuardians;
}
