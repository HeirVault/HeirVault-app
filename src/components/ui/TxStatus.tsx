"use client";

import type { TransactionState } from "@/lib/stellar/transactions";
import { getTransactionUrl } from "@/lib/stellar/explorer";
import { truncateMiddle } from "@/lib/format";

import { Alert, type AlertTone } from "./Alert";
import { Spinner } from "./Spinner";

/**
 * Renders the lifecycle of a blockchain action.
 *
 * The `success` state says "confirmed" only because it is reachable only after
 * Soroban RPC confirmed the transaction hash — see
 * `src/lib/stellar/transactions.ts`. The `pending` state explicitly does *not*
 * claim success.
 */
const PHASE_COPY: Record<
  Exclude<TransactionState["phase"], "idle">,
  { tone: AlertTone; title: string; body: string; busy?: boolean }
> = {
  building: {
    tone: "info",
    title: "Preparing transaction",
    body: "Simulating the contract call to calculate the resource fee.",
    busy: true,
  },
  "awaiting-signature": {
    tone: "info",
    title: "Waiting for your signature",
    body: "Approve the transaction in your wallet. Nothing is submitted until you sign.",
    busy: true,
  },
  submitted: {
    tone: "info",
    title: "Submitted to the network",
    body: "Waiting for the ledger to include the transaction.",
    busy: true,
  },
  pending: {
    tone: "warning",
    title: "Confirmation not observed yet",
    body: "The network accepted the transaction but it is not confirmed yet. This is not a success state — check the explorer before relying on it.",
  },
  success: {
    tone: "success",
    title: "Transaction confirmed",
    body: "Soroban RPC reported the transaction as successful.",
  },
  failed: {
    tone: "danger",
    title: "Transaction failed",
    body: "Nothing was changed on-chain.",
  },
  rejected: {
    tone: "warning",
    title: "Signature rejected",
    body: "You declined the request in your wallet. No transaction was submitted.",
  },
  "not-configured": {
    tone: "neutral",
    title: "Contract not configured",
    body: "This action needs a deployed HeirVault contract. Set NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID to enable it.",
  },
};

export interface TxStatusProps {
  state: TransactionState;
  className?: string;
}

export function TxStatus({ state, className }: TxStatusProps) {
  if (state.phase === "idle") return null;

  const copy = PHASE_COPY[state.phase];
  const explorerUrl = state.hash ? getTransactionUrl(state.hash) : null;

  return (
    <Alert
      tone={copy.tone}
      title={
        <span className="inline-flex items-center gap-2">
          {copy.busy && <Spinner aria-hidden className="h-3.5 w-3.5" />}
          {copy.title}
        </span>
      }
      className={className}
    >
      <p>{copy.body}</p>
      {state.error && <p className="mt-1 font-mono text-xs break-words">{state.error}</p>}
      {state.hash && (
        <p className="mt-2 font-mono text-xs break-all">
          {truncateMiddle(state.hash, 10)}
          {state.ledger ? ` · ledger ${state.ledger}` : ""}
        </p>
      )}
      {explorerUrl && (
        <a className="hv-link mt-2 inline-block text-xs" href={explorerUrl} target="_blank" rel="noreferrer">
          View on explorer
        </a>
      )}
    </Alert>
  );
}
