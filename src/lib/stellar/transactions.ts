/**
 * Soroban transaction building, submission and status tracking.
 *
 * Honesty contract (see README "No fake blockchain state"):
 *  - A transaction is reported as `success` **only** when the Soroban RPC
 *    endpoint returns a `SUCCESS` status for that exact transaction hash.
 *  - If the contract is not configured, submission throws before any network
 *    call and the UI renders a `not-configured` state.
 *  - Rejected wallet signatures are surfaced as `rejected`, never as success.
 */

import {
  Account,
  BASE_FEE,
  Memo,
  Transaction,
  TransactionBuilder,
  rpc,
  type xdr,
} from "@stellar/stellar-sdk";

import { getRpcServer } from "./client";
import { getNetworkPassphrase, type StellarNetworkId } from "./network";

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

/** Thrown when the user declines to sign in their wallet. */
export class TransactionRejectedError extends Error {
  constructor(message = "The wallet signature request was rejected.") {
    super(message);
    this.name = "TransactionRejectedError";
  }
}

/** Thrown when a transaction was submitted but the network reported a failure. */
export class TransactionFailedError extends Error {
  constructor(
    message: string,
    readonly hash?: string,
  ) {
    super(message);
    this.name = "TransactionFailedError";
  }
}

export interface BuildTransactionParams {
  /** Source (fee-paying) account address. */
  sourceAddress: string;
  operations: xdr.Operation[];
  /** Optional pre-loaded account sequence. Fetched from RPC when omitted. */
  account?: Account;
  baseFee?: string;
  memoText?: string;
  timeoutSeconds?: number;
  network?: StellarNetworkId;
}

/** Build an unsigned transaction envelope for the given operations. */
export async function buildTransaction({
  sourceAddress,
  operations,
  account,
  baseFee = BASE_FEE,
  memoText,
  timeoutSeconds = 60,
  network,
}: BuildTransactionParams): Promise<Transaction> {
  if (operations.length === 0) {
    throw new Error("A transaction must contain at least one operation.");
  }

  const source = account ?? (await getRpcServer(network).getAccount(sourceAddress));

  const builder = new TransactionBuilder(source, {
    fee: baseFee,
    networkPassphrase: getNetworkPassphrase(network),
  });

  for (const operation of operations) {
    builder.addOperation(operation);
  }

  if (memoText) {
    builder.addMemo(Memo.text(memoText));
  }

  return builder.setTimeout(timeoutSeconds).build();
}

export interface PreparedTransaction {
  transaction: Transaction;
  /** Raw simulation response, retained for diagnostics/UI detail. */
  simulation: rpc.Api.SimulateTransactionResponse;
  minResourceFee: string;
}

/**
 * Simulate a transaction and assemble the resulting footprint/resource fees.
 *
 * Simulation is a *dry run*. A simulation failure means the transaction would
 * be rejected — for example because the contract is missing, the entrypoint
 * does not exist, or a contract-level assertion failed. We surface that error
 * instead of fabricating a result.
 */
export async function prepareTransaction(
  transaction: Transaction,
  network?: StellarNetworkId,
): Promise<PreparedTransaction> {
  const server = getRpcServer(network);
  const simulation = await server.simulateTransaction(transaction);

  if (rpc.Api.isSimulationError(simulation)) {
    throw new TransactionFailedError(
      `Simulation failed: ${simulation.error}`,
    );
  }

  const prepared = rpc.assembleTransaction(transaction, simulation).build();
  const minResourceFee =
    "minResourceFee" in simulation && simulation.minResourceFee
      ? simulation.minResourceFee
      : "0";

  return { transaction: prepared, simulation, minResourceFee };
}

export interface SubmitResult {
  hash: string;
  /** `SUCCESS` is only returned after the ledger confirms the transaction. */
  status: "success" | "pending" | "failed";
  ledger?: number;
  error?: string;
}

/**
 * Submit a signed transaction and wait for confirmation.
 *
 * Returns `pending` when the RPC accepted the envelope but confirmation could
 * not be observed within this call — that is *not* a success.
 */
export async function submitSignedTransaction(
  signedXdr: string,
  network?: StellarNetworkId,
): Promise<SubmitResult> {
  const server = getRpcServer(network);
  const transaction = TransactionBuilder.fromXDR(
    signedXdr,
    getNetworkPassphrase(network),
  ) as Transaction;

  const sendResponse = await server.sendTransaction(transaction);

  if (sendResponse.status === "ERROR") {
    throw new TransactionFailedError(
      `The network rejected the transaction: ${JSON.stringify(sendResponse.errorResult ?? sendResponse.status)}`,
    );
  }

  const hash = sendResponse.hash;

  try {
    const confirmation = await server.pollTransaction(hash, { attempts: 20 });
    if (confirmation.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { hash, status: "success", ledger: confirmation.ledger };
    }
    if (confirmation.status === rpc.Api.GetTransactionStatus.FAILED) {
      return { hash, status: "failed", error: "The transaction failed on-chain." };
    }
  } catch (error) {
    return {
      hash,
      status: "pending",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return { hash, status: "pending" };
}

/**
 * Full pipeline: build → simulate/prepare → hand the XDR to a wallet signer →
 * submit → confirm.
 *
 * The `sign` callback is supplied by the wallet layer, keeping this module
 * completely unaware of which wallet provider is in use.
 */
export async function signAndSubmit(
  prepared: PreparedTransaction,
  sign: (xdrEnvelope: string) => Promise<string>,
  network?: StellarNetworkId,
): Promise<SubmitResult> {
  const xdrEnvelope = prepared.transaction.toXDR();
  const signedXdr = await sign(xdrEnvelope);
  return submitSignedTransaction(signedXdr, network);
}
