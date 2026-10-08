"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { VaultWizard } from "@/components/vault/wizard/VaultWizard";

export default function NewVaultPage() {
  return (
    <div className="hv-container space-y-8 py-10">
      <PageHeader
        eyebrow="New vault"
        title="Create an inheritance vault"
        description="Eight short steps: vault details, the asset you deposit, beneficiaries and their shares, optional guardians, activation conditions, a review, and finally the wallet transaction."
      />

      <Alert tone="neutral" title="Your assets stay yours">
        Vault creation is a single signed Soroban transaction that both deploys the vault and transfers the
        initial deposit. Nothing is submitted until you approve it in your wallet.
      </Alert>

      <VaultWizard />
    </div>
  );
}
