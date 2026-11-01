/**
 * Transaction UI state.
 *
 * The transaction *pipeline* — argument encoding, simulation, preparation,
 * wallet authorization, submission and confirmation polling — lives in
 * `heirvault-sdk` and is driven by `@/hooks/useVault`. This module now only
 * defines the phase vocabulary the React components render, so presentation
 * code never has to know how a transaction is built.
 *
 * The honesty rule is unchanged and enforced by the SDK: a transaction is
 * reported as `success` only after Soroban RPC confirms its hash.
 */

import type { xdr } from "@stellar/stellar-sdk";

/** Lifecycle phases for a user-initiated blockchain action. */
export type TransactionPhase =
  | "idle"
  | "building"
  | "awaiting-signature"
  | "submitted"
  | "pending"
  | "success"
  | "failed"
  | "rejected"
  | "not-configured";

export interface TransactionState {
  phase: TransactionPhase;
  /** Transaction hash — only ever set for transactions the network accepted. */
  hash?: string;
  /** Machine/human readable error message for failed/rejected phases. */
  error?: string;
  /** Ledger in which the transaction was confirmed (success only). */
  ledger?: number;
}

export const IDLE_TRANSACTION: TransactionState = { phase: "idle" };

/**
 * Result of one submitted operation, as consumed by the vault store.
 *
 * The SDK returns a richer `TxSuccess`; `useVault` narrows it to this shape so
 * the rest of the app stays decoupled from the SDK's generic parameters.
 */
export interface SubmitResult {
  hash: string;
  status: "success" | "pending" | "failed";
  ledger?: number;
  error?: string;
  /** The contract function's raw return value, when it returned one. */
  returnValue?: xdr.ScVal;
}
