"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { WalletGate } from "@/components/wallet/WalletGate";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Stepper } from "@/components/ui/Stepper";
import { useBeneficiaries } from "@/hooks/useBeneficiaries";
import { useVault } from "@/hooks/useVault";
import { useWallet } from "@/hooks/useWallet";
import { getContractConfig, getSupportedAssets, isContractConfigured } from "@/lib/stellar/contract";
import { IDLE_TRANSACTION, type TransactionState } from "@/lib/stellar/transactions";
import { createEmptyDraft } from "@/lib/vault/repository";
import { validateDraft, validateStep, type ValidationResult } from "@/lib/vault/validation";
import type { VaultDraft } from "@/lib/vault/types";

import { StepActivation } from "./StepActivation";
import { StepAsset } from "./StepAsset";
import { StepBeneficiaries } from "./StepBeneficiaries";
import { StepConfirm } from "./StepConfirm";
import { StepDistribution } from "./StepDistribution";
import { StepGuardians } from "./StepGuardians";
import { StepInfo } from "./StepInfo";
import { StepReview } from "./StepReview";
import { CONFIRM_STEP, LAST_EDITABLE_STEP, WIZARD_STEP_DEFINITIONS, type WizardStepProps } from "./steps";

const STEP_STEPPER = WIZARD_STEP_DEFINITIONS.map((step) => ({ id: step.id, label: step.short }));

export function VaultWizard() {
  const wallet = useWallet();
  const { saveDraft, deployVault } = useVault();
  const supportedAssets = useMemo(() => getSupportedAssets(), []);
  const contractConfig = useMemo(() => getContractConfig(), []);
  const contractConfigured = isContractConfigured();

  const [stepIndex, setStepIndex] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [transaction, setTransaction] = useState<TransactionState>(IDLE_TRANSACTION);
  const [draft, setDraft] = useState<VaultDraft>(() =>
    createEmptyDraft({
      contractId: supportedAssets[0]?.contractId ?? "",
      symbol: supportedAssets[0]?.symbol ?? "USDC",
      decimals: supportedAssets[0]?.decimals ?? 7,
    }),
  );

  // Beneficiary state lives here so it survives moving between steps.
  const beneficiaries = useBeneficiaries(draft.beneficiaries);
  const beneficiaryList = beneficiaries.beneficiaries;

  useEffect(() => {
    setDraft((current) =>
      current.beneficiaries === beneficiaryList ? current : { ...current, beneficiaries: beneficiaryList },
    );
  }, [beneficiaryList]);

  const update = useCallback((patch: Partial<VaultDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const stepValidation: ValidationResult = useMemo(() => {
    const id = WIZARD_STEP_DEFINITIONS[stepIndex].id;
    if (id === "confirm") return { valid: true, issues: [] };
    return validateStep(id, draft);
  }, [draft, stepIndex]);

  const fullValidation = useMemo(() => validateDraft(draft), [draft]);

  const stepProps: WizardStepProps = {
    draft,
    update,
    beneficiaries,
    showErrors,
  };

  const isLastEditable = stepIndex === LAST_EDITABLE_STEP;
  const isConfirmStep = stepIndex === CONFIRM_STEP;

  /** Persist the local draft record, then hand over to the confirmation step. */
  const goToConfirm = useCallback(async () => {
    if (!wallet.address) return;
    setSavingDraft(true);
    try {
      const vault = await saveDraft(draft, wallet.address);
      setVaultId(vault.id);
      setStepIndex(CONFIRM_STEP);
      setShowErrors(false);
    } finally {
      setSavingDraft(false);
    }
  }, [draft, saveDraft, wallet.address]);

  async function handleNext() {
    const validation = validateStep(WIZARD_STEP_DEFINITIONS[stepIndex].id, draft);
    if (!validation.valid) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    if (isLastEditable) {
      await goToConfirm();
      return;
    }
    setStepIndex((index) => Math.min(CONFIRM_STEP, index + 1));
  }

  function handleBack() {
    setShowErrors(false);
    setStepIndex((index) => Math.max(0, index - 1));
  }

  async function handleDeploy() {
    if (!vaultId) return;
    const result = await deployVault(vaultId);
    setTransaction(result);
  }

  const deployDisabledReason = !contractConfigured
    ? "A deployed HeirVault contract id is required."
    : wallet.status !== "connected"
      ? "Connect a wallet to sign the deployment."
      : !wallet.networkMatches
        ? `Switch your wallet to ${contractConfig.network.label}.`
        : undefined;

  return (
    <WalletGate description="Creating a vault requires your Stellar address as the owner.">
      <div className="space-y-6">
        <Stepper
          steps={STEP_STEPPER}
          currentIndex={stepIndex}
          onSelect={(index) => {
            if (index < stepIndex && index <= LAST_EDITABLE_STEP) setStepIndex(index);
          }}
        />

        <Card>
          <CardHeader
            title={WIZARD_STEP_DEFINITIONS[stepIndex].label}
            description={`Step ${stepIndex + 1} of ${WIZARD_STEP_DEFINITIONS.length}`}
          />
          <CardBody>
            {stepIndex === 0 && <StepInfo {...stepProps} />}
            {stepIndex === 1 && <StepAsset {...stepProps} supportedAssets={supportedAssets} />}
            {stepIndex === 2 && <StepBeneficiaries {...stepProps} />}
            {stepIndex === 3 && <StepDistribution {...stepProps} />}
            {stepIndex === 4 && <StepGuardians {...stepProps} />}
            {stepIndex === 5 && <StepActivation {...stepProps} />}
            {stepIndex === 6 && (
              <StepReview
                {...stepProps}
                onEdit={setStepIndex}
                validationIssues={fullValidation.issues}
              />
            )}
            {isConfirmStep && (
              <StepConfirm
                draft={draft}
                vaultId={vaultId}
                contractConfigured={contractConfigured}
                networkLabel={contractConfig.network.label}
                transaction={transaction}
                deployDisabledReason={deployDisabledReason}
                onDeploy={handleDeploy}
              />
            )}
          </CardBody>

          {!isConfirmStep && (
            <CardFooter>
              <Button variant="ghost" onClick={handleBack} disabled={stepIndex === 0}>
                Back
              </Button>
              <div className="flex items-center gap-3">
                {!stepValidation.valid && showErrors && (
                  <span className="text-xs text-danger-700">
                    {stepValidation.issues.length} issue{stepValidation.issues.length === 1 ? "" : "s"} to fix
                  </span>
                )}
                <Button onClick={handleNext} loading={savingDraft} loadingLabel="Saving…">
                  {isLastEditable ? "Review complete — continue" : "Continue"}
                </Button>
              </div>
            </CardFooter>
          )}
        </Card>

        {isConfirmStep && !contractConfigured && (
          <Alert tone="neutral" title="Draft saved">
            Your configuration is stored locally. Connect to a deployed contract to turn it into a real vault.
          </Alert>
        )}
      </div>
    </WalletGate>
  );
}
