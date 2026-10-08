"use client";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { AllocationBar } from "@/components/beneficiaries/AllocationBar";
import { beneficiaryAmount, formatAllocation } from "@/lib/vault/calculations";
import { formatAssetAmount, formatDate } from "@/lib/format";
import { ACTIVATION_TRIGGER_LABELS } from "@/lib/vault/types";

import type { WizardStepProps } from "./steps";

export interface StepReviewProps extends WizardStepProps {
  /** Jump back to a step for editing. */
  onEdit: (stepIndex: number) => void;
  /** Whether the whole draft passes validation. */
  validationIssues: { field: string; message: string }[];
}

export function StepReview({ draft, onEdit, validationIssues }: StepReviewProps) {
  const valid = validationIssues.length === 0;

  return (
    <div className="space-y-5">
      {valid ? (
        <Alert tone="success" title="Ready to deploy">
          Everything below will be submitted as a single Soroban contract invocation, signed in your wallet.
        </Alert>
      ) : (
        <Alert tone="danger" title="Fix these issues before deploying">
          <ul className="list-inside list-disc">
            {validationIssues.map((issue) => (
              <li key={issue.field}>
                <span className="font-mono text-xs">{issue.field}</span> — {issue.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Vault information"
          action={
            <Button variant="ghost" size="sm" onClick={() => onEdit(0)}>
              Edit
            </Button>
          }
        />
        <CardBody className="space-y-1 text-sm">
          <p className="text-base font-semibold text-content-strong">{draft.name || "Untitled vault"}</p>
          {draft.description && <p className="text-muted">{draft.description}</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Asset & deposit"
          action={
            <Button variant="ghost" size="sm" onClick={() => onEdit(1)}>
              Edit
            </Button>
          }
        />
        <CardBody className="space-y-2 text-sm">
          <p className="font-semibold text-content-strong">
            {formatAssetAmount(draft.asset.amount || "0", draft.asset.symbol, draft.asset.decimals)}
          </p>
          <AddressDisplay address={draft.asset.contractId} kind="contract" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Beneficiaries & distribution"
          description={`${draft.beneficiaries.length} beneficiaries, total ${formatAllocation(
            draft.beneficiaries.reduce((sum, b) => sum + b.allocationBps, 0),
          )}`}
          action={
            <Button variant="ghost" size="sm" onClick={() => onEdit(2)}>
              Edit
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <AllocationBar beneficiaries={draft.beneficiaries} />
          <ul className="divide-y divide-border">
            {draft.beneficiaries.map((beneficiary) => (
              <li key={beneficiary.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <AddressDisplay address={beneficiary.address} showCopy={false} />
                <span className="text-sm text-content">
                  {formatAllocation(beneficiary.allocationBps)} ·{" "}
                  {formatAssetAmount(
                    beneficiaryAmount(
                      draft.asset.amount || "0",
                      beneficiary.allocationBps,
                      draft.asset.decimals,
                    ),
                    draft.asset.symbol,
                    draft.asset.decimals,
                  )}
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Guardians"
          description={
            draft.guardians.length === 0
              ? "No guardians configured"
              : `${draft.guardians.length} guardian(s) · ${draft.activation.guardianThreshold} approval(s) required`
          }
          action={
            <Button variant="ghost" size="sm" onClick={() => onEdit(4)}>
              Edit
            </Button>
          }
        />
        {draft.guardians.length > 0 && (
          <CardBody>
            <ul className="space-y-2 text-sm">
              {draft.guardians.map((guardian) => (
                <li key={guardian.id} className="flex flex-wrap items-center justify-between gap-2">
                  <AddressDisplay address={guardian.address} showCopy={false} />
                  <span className="text-muted">{guardian.role}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Activation conditions"
          action={
            <Button variant="ghost" size="sm" onClick={() => onEdit(5)}>
              Edit
            </Button>
          }
        />
        <CardBody>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Trigger</dt>
              <dd className="text-content-strong">{ACTIVATION_TRIGGER_LABELS[draft.activation.trigger]}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Check-in interval</dt>
              <dd className="text-content-strong">{draft.activation.checkInIntervalDays} days</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Grace period</dt>
              <dd className="text-content-strong">{draft.activation.gracePeriodDays} days</dd>
            </div>
            {draft.activation.scheduledActivationAt && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Scheduled activation</dt>
                <dd className="text-content-strong">
                  {formatDate(draft.activation.scheduledActivationAt)}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Emergency activation</dt>
              <dd className="text-content-strong">
                {draft.activation.emergencyActivationEnabled ? "Enabled" : "Disabled"}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
