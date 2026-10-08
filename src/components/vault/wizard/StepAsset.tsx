"use client";

import { Alert } from "@/components/ui/Alert";
import { InputField, SelectField } from "@/components/ui/Field";
import { formatAssetAmount } from "@/lib/format";
import { validateAmount } from "@/lib/vault/validation";

import type { WizardStepProps } from "./steps";

export interface StepAssetProps extends WizardStepProps {
  /** Assets this deployment supports, from environment configuration. */
  supportedAssets: { contractId: string; symbol: string; decimals: number; label: string }[];
}

export function StepAsset({ draft, update, available, showErrors, supportedAssets }: StepAssetProps) {
  const amountValidation = validateAmount(draft.asset.amount, draft.asset.decimals, {
    field: "asset.amount",
    available,
  });
  const amountError = showErrors ? amountValidation.issues[0]?.message : undefined;

  const options = supportedAssets.map((asset) => ({
    value: asset.contractId,
    label: `${asset.label} (${asset.symbol})`,
  }));

  return (
    <div className="space-y-5">
      {supportedAssets.length === 0 ? (
        <Alert tone="danger" title="No supported asset configured">
          This environment does not define a supported asset. Set{" "}
          <code className="font-mono">NEXT_PUBLIC_USDC_CONTRACT_ID</code> to the Stellar Asset Contract id of
          the asset the vault should hold. The wizard will not invent an asset id.
        </Alert>
      ) : (
        <SelectField
          label="Asset to protect"
          value={draft.asset.contractId}
          options={options}
          onChange={(event) => {
            const selected = supportedAssets.find((asset) => asset.contractId === event.target.value);
            if (!selected) return;
            update({
              asset: {
                ...draft.asset,
                contractId: selected.contractId,
                symbol: selected.symbol,
                decimals: selected.decimals,
              },
            });
          }}
          hint="Assets are identified by their Stellar Asset Contract (SAC) id."
          required
        />
      )}

      <InputField
        label="Initial deposit"
        type="text"
        inputMode="decimal"
        placeholder="0.00"
        value={draft.asset.amount}
        onChange={(event) => update({ asset: { ...draft.asset, amount: event.target.value } })}
        error={amountError}
        required
        trailing={<span className="hv-hint">{draft.asset.symbol}</span>}
        hint={
          available
            ? `Available balance: ${formatAssetAmount(available, draft.asset.symbol, draft.asset.decimals)}`
            : "The balance is read from Horizon once your wallet is connected."
        }
      />

      <Alert tone="neutral" title="Deposit is part of the deployment transaction">
        The initial deposit is transferred into the vault by the same signed transaction that creates it.
        Nothing moves until you approve it in your wallet.
      </Alert>
    </div>
  );
}
