"use client";

import { useMemo, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InputField } from "@/components/ui/Field";
import { TxStatus } from "@/components/ui/TxStatus";
import { useWallet } from "@/hooks/useWallet";
import { useVault } from "@/hooks/useVault";
import { formatAssetAmount } from "@/lib/format";
import { IDLE_TRANSACTION, type TransactionState } from "@/lib/stellar/transactions";
import { validateAmount } from "@/lib/vault/validation";
import type { Vault } from "@/lib/vault/types";

export interface DepositFormProps {
  vault: Vault;
  /**
   * Available balance for the asset, when known. `undefined` means the balance
   * could not be read — we then skip the insufficient-funds check rather than
   * guessing.
   */
  available?: string;
}

export function DepositForm({ vault, available }: DepositFormProps) {
  const { address } = useWallet();
  const { deposit } = useVault();
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [tx, setTx] = useState<TransactionState>(IDLE_TRANSACTION);

  const validation = useMemo(
    () => validateAmount(amount, vault.asset.decimals, { field: "amount", available }),
    [amount, available, vault.asset.decimals],
  );
  const error = touched && !validation.valid ? validation.issues[0]?.message : undefined;

  const isOwner = !!address && address === vault.owner;
  const terminal = vault.status === "cancelled" || vault.status === "completed";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!validation.valid) return;
    const result = await deposit(vault.id, amount.trim());
    setTx(result);
  }

  return (
    <Card>
      <CardHeader
        title="Deposit / top up"
        description={`Add ${vault.asset.symbol} to this vault from your connected wallet.`}
      />
      <form onSubmit={submit}>
        <CardBody className="space-y-4">
          <InputField
            label="Amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            onBlur={() => setTouched(true)}
            error={error}
            required
            trailing={<span className="hv-hint">{vault.asset.symbol}</span>}
          />

          <p className="text-xs text-muted">
            Current protected balance: {formatAssetAmount(vault.asset.amount, vault.asset.symbol, vault.asset.decimals)}
          </p>

          {!isOwner && <Alert tone="neutral">Only the vault owner can deposit.</Alert>}
          {terminal && <Alert tone="neutral">This vault is {vault.status}; deposits are closed.</Alert>}

          <Button
            type="submit"
            fullWidth
            disabled={!isOwner || terminal || (touched && !validation.valid)}
          >
            Deposit {vault.asset.symbol}
          </Button>

          <TxStatus state={tx} />
        </CardBody>
      </form>
    </Card>
  );
}
