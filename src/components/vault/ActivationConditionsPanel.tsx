"use client";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatDate } from "@/lib/format";
import { ACTIVATION_TRIGGER_LABELS, type ActivationConditions } from "@/lib/vault/types";

export interface ActivationConditionsPanelProps {
  activation: ActivationConditions;
  activatedAt?: string;
  guardianApprovals: number;
  guardianCount: number;
}

export function ActivationConditionsPanel({
  activation,
  activatedAt,
  guardianApprovals,
  guardianCount,
}: ActivationConditionsPanelProps) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Activation trigger", value: ACTIVATION_TRIGGER_LABELS[activation.trigger] },
    { label: "Check-in interval", value: `${activation.checkInIntervalDays} days` },
    { label: "Grace period", value: `${activation.gracePeriodDays} days` },
  ];

  if (activation.trigger === "scheduled") {
    rows.push({ label: "Scheduled activation", value: formatDate(activation.scheduledActivationAt) });
  }
  if (activation.trigger === "guardian-approval") {
    rows.push({
      label: "Guardian approvals",
      value: `${guardianApprovals} of ${activation.guardianThreshold} required (${guardianCount} guardians)`,
    });
  }
  rows.push({
    label: "Emergency activation",
    value: activation.emergencyActivationEnabled ? "Enabled" : "Disabled",
  });
  if (activatedAt) {
    rows.push({ label: "Activated", value: formatDate(activatedAt) });
  }

  return (
    <Card>
      <CardHeader
        title="Activation conditions"
        description="What must happen before beneficiaries can claim."
        action={
          activatedAt ? <Badge tone="warning">Triggered</Badge> : <Badge tone="neutral">Armed</Badge>
        }
      />
      <CardBody>
        <dl className="divide-y divide-border">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
              <dt className="text-sm text-muted">{row.label}</dt>
              <dd className="text-right text-sm font-medium text-content-strong">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}
