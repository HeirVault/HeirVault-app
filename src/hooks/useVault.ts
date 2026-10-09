"use client";

/**
 * Vault state + actions.
 *
 * Every blockchain write funnels through {@link runOperations} and
 * {@link execute}, which enforce the honesty rules globally:
 *
 *   1. no contract id    → `not-configured`, no network call is made;
 *   2. no wallet / wrong network → `failed` with a clear message;
 *   3. simulation fails  → `failed` with the contract's error;
 *   4. user rejects      → `rejected`, never success;
 *   5. `success` is only reported when Soroban RPC confirms the hash.
 *
 * Vault records in the repository are only updated after (5).
 *
 * Deployment is a multi-step flow that mirrors the contract's actual workflow:
 * `create_vault` returns a numeric vault id, so that id is read back from the
 * confirmed transaction before beneficiaries, guardians and the first deposit
 * are submitted against it.
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { xdr } from "@stellar/stellar-sdk";

import { useWallet } from "@/hooks/useWallet";
import {
  activationModeFromTrigger,
  buildActivateVaultOp,
  buildAddBeneficiaryOp,
  buildAddGuardianOp,
  buildCancelVaultOp,
  buildCheckInOp,
  buildClaimOp,
  buildCreateVaultOp,
  buildDepositOp,
  buildGuardianApproveOp,
  buildSetGuardianThresholdOp,
  ContractNotConfiguredError,
  getContractConfig,
  isContractConfigured,
  readVaultIdFromReturnValue,
} from "@/lib/stellar/contract";
import { getTransactionUrl } from "@/lib/stellar/explorer";
import { getNetworkConfig } from "@/lib/stellar/network";
import {
  buildTransaction,
  IDLE_TRANSACTION,
  prepareTransaction,
  submitSignedTransaction,
  TransactionRejectedError,
  type SubmitResult,
  type TransactionState,
} from "@/lib/stellar/transactions";
import { deriveVaultState, toBaseUnits } from "@/lib/vault/calculations";
import {
  createDefaultRepository,
  createVaultFromDraft,
  type VaultDataSource,
} from "@/lib/vault/repository";
import type { Vault, VaultDraft, VaultTransaction, VaultTransactionType } from "@/lib/vault/types";

export interface VaultContextValue {
  vaults: Vault[];
  loading: boolean;
  error: string | null;
  dataSource: VaultDataSource;
  /** True when the repository is serving development fixtures. */
  isDevelopmentData: boolean;
  contractConfigured: boolean;
  networkLabel: string;
  transaction: TransactionState;
  refresh: () => Promise<void>;
  getVault: (id: string) => Vault | undefined;
  /** Persist a locally-configured draft. Never implies on-chain state. */
  saveDraft: (draft: VaultDraft, owner: string) => Promise<Vault>;
  saveVault: (vault: Vault) => Promise<void>;
  removeVault: (id: string) => Promise<void>;
  resetTransaction: () => void;
  deployVault: (vaultId: string) => Promise<TransactionState>;
  checkIn: (vaultId: string) => Promise<TransactionState>;
  deposit: (vaultId: string, amount: string) => Promise<TransactionState>;
  cancelVault: (vaultId: string) => Promise<TransactionState>;
  approveActivation: (vaultId: string) => Promise<TransactionState>;
  triggerActivation: (vaultId: string) => Promise<TransactionState>;
  claim: (vaultId: string, beneficiaryAddress: string) => Promise<TransactionState>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

const NOT_CONFIGURED =
  "No HeirVault contract is configured in this environment. Set NEXT_PUBLIC_HEIRVAULT_CONTRACT_ID.";

function toTransactionState(error: unknown): TransactionState {
  if (error instanceof ContractNotConfiguredError) {
    return { phase: "not-configured", error: error.message };
  }
  if (error instanceof TransactionRejectedError) {
    return { phase: "rejected", error: error.message };
  }
  return {
    phase: "failed",
    error: error instanceof Error ? error.message : "The transaction could not be completed.",
  };
}

/** Outcome of one build → simulate → sign → submit → confirm round trip. */
type OperationOutcome =
  | { ok: true; result: SubmitResult }
  | { ok: false; state: TransactionState };

/** Guards shared by every write action. */
type Preflight =
  | { vault: Vault; address: string }
  | { state: TransactionState };

function failure(error: string): TransactionState {
  return { phase: "failed", error };
}

function recordTransaction(vault: Vault, transaction: VaultTransaction): Vault {
  return { ...vault, transactions: [...vault.transactions, transaction] };
}

function historyEntry(
  type: VaultTransactionType,
  result: SubmitResult,
): VaultTransaction {
  return {
    hash: result.hash,
    type,
    status: "success",
    ledger: result.ledger,
    timestamp: new Date().toISOString(),
    explorerUrl: getTransactionUrl(result.hash) ?? undefined,
  };
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transaction, setTransaction] = useState<TransactionState>(IDLE_TRANSACTION);

  const contractConfig = useMemo(() => getContractConfig(), []);
  const network = useMemo(() => getNetworkConfig(), []);
  const contractConfigured = isContractConfigured();

  // The repository needs the owner's address to read `get_vaults_by_owner`, so
  // it is re-created when the connected wallet changes.
  const repository = useMemo(
    () => createDefaultRepository({ owner: wallet.address ?? undefined }),
    [wallet.address],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVaults(await repository.list());
    } catch (listError) {
      setVaults([]);
      setError(
        listError instanceof Error
          ? listError.message
          : "Vaults could not be loaded from the configured source.",
      );
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const getVault = useCallback(
    (id: string) => vaults.find((vault) => vault.id === id),
    [vaults],
  );

  const saveVault = useCallback(
    async (vault: Vault) => {
      await repository.save(vault);
      setVaults((current) => {
        const index = current.findIndex((entry) => entry.id === vault.id);
        if (index < 0) return [...current, vault];
        const next = [...current];
        next[index] = vault;
        return next;
      });
    },
    [repository],
  );

  const removeVault = useCallback(
    async (id: string) => {
      await repository.remove(id);
      setVaults((current) => current.filter((vault) => vault.id !== id));
    },
    [repository],
  );

  const saveDraft = useCallback(
    async (draft: VaultDraft, owner: string) => {
      // Local ids are never numeric, which is how the rest of the app tells a
      // draft apart from a vault that exists on-chain.
      const vault = createVaultFromDraft(draft, owner, { id: `local_${Date.now().toString(36)}` });
      await saveVault(vault);
      return vault;
    },
    [saveVault],
  );

  /** Checks that must pass before any write action is attempted. */
  const preflight = useCallback(
    (vaultId: string): Preflight => {
      if (!contractConfigured) {
        return { state: { phase: "not-configured", error: NOT_CONFIGURED } };
      }
      const vault = vaults.find((entry) => entry.id === vaultId);
      if (!vault) {
        return { state: failure("Vault not found.") };
      }
      if (!/^\d+$/.test(vault.id)) {
        return { state: failure("This vault has not been deployed to the network yet.") };
      }
      if (!wallet.address) {
        return { state: failure("Connect a Stellar wallet before submitting transactions.") };
      }
      if (!wallet.networkMatches) {
        return {
          state: failure(
            `Your wallet is on a different network. Switch it to ${network.label}.`,
          ),
        };
      }
      return { vault, address: wallet.address };
    },
    [contractConfigured, network.label, vaults, wallet.address, wallet.networkMatches],
  );

  const preflightDraft = useCallback(
    (vaultId: string): Preflight => {
      if (!contractConfigured) {
        return { state: { phase: "not-configured", error: NOT_CONFIGURED } };
      }
      const vault = vaults.find((entry) => entry.id === vaultId);
      if (!vault) {
        return { state: failure("Vault not found.") };
      }
      if (/^\d+$/.test(vault.id)) {
        return {
          state: failure(`This vault is already deployed on-chain as vault ${vault.id}.`),
        };
      }
      if (!wallet.address) {
        return { state: failure("Connect a Stellar wallet before submitting transactions.") };
      }
      if (!wallet.networkMatches) {
        return {
          state: failure(
            `Your wallet is on a different network. Switch it to ${network.label}.`,
          ),
        };
      }
      return { vault, address: wallet.address };
    },
    [contractConfigured, network.label, vaults, wallet.address, wallet.networkMatches],
  );

  /**
   * Build → simulate → sign → submit → confirm.
   *
   * Sets the in-flight phases itself; the caller decides what the terminal
   * phase means (a multi-step deploy only reports success at the very end).
   */
  const runOperations = useCallback(
    async (address: string, operations: xdr.Operation[]): Promise<OperationOutcome> => {
      if (operations.length === 0) {
        return { ok: false, state: failure("Nothing to submit.") };
      }

      setTransaction({ phase: "building" });
      try {
        const built = await buildTransaction({
          sourceAddress: address,
          operations,
        });
        const prepared = await prepareTransaction(built);

        setTransaction({ phase: "awaiting-signature" });
        let signedXdr: string;
        try {
          signedXdr = await wallet.sign(prepared.transaction.toXDR());
        } catch (signError) {
          return {
            ok: false,
            state: toTransactionState(
              signError instanceof TransactionRejectedError
                ? signError
                : new TransactionRejectedError(
                    signError instanceof Error ? signError.message : undefined,
                  ),
            ),
          };
        }

        setTransaction({ phase: "submitted" });
        const result = await submitSignedTransaction(signedXdr, network.id);

        if (result.status === "success") {
          return { ok: true, result };
        }
        if (result.status === "pending") {
          return {
            ok: false,
            state: {
              phase: "pending",
              hash: result.hash,
              error: result.error,
            },
          };
        }
        return {
          ok: false,
          state: {
            phase: "failed",
            hash: result.hash,
            error: result.error ?? "The transaction failed on-chain.",
          },
        };
      } catch (actionError) {
        return { ok: false, state: toTransactionState(actionError) };
      }
    },
    [network.id, wallet],
  );

  /**
   * A single-transaction action.
   *
   * @param mutate Applied to the stored vault only after on-chain success.
   */
  const execute = useCallback(
    async (
      vaultId: string,
      type: VaultTransactionType,
      buildOps: (vault: Vault, address: string) => xdr.Operation[],
      mutate: (vault: Vault, hash: string, ledger?: number) => Vault,
    ): Promise<TransactionState> => {
      const prepared = preflight(vaultId);
      if ("state" in prepared) {
        setTransaction(prepared.state);
        return prepared.state;
      }
      const { vault, address } = prepared;

      const outcome = await runOperations(address, buildOps(vault, address));
      if (!outcome.ok) {
        setTransaction(outcome.state);
        return outcome.state;
      }

      const { result } = outcome;
      const updated = recordTransaction(
        mutate(vault, result.hash, result.ledger),
        historyEntry(type, result),
      );
      await saveVault(updated);

      const state: TransactionState = {
        phase: "success",
        hash: result.hash,
        ledger: result.ledger,
      };
      setTransaction(state);
      return state;
    },
    [preflight, runOperations, saveVault],
  );

  /**
   * Deploy a draft: `create_vault` → read the returned id → configure
   * beneficiaries/guardians → optional first deposit.
   *
   * Each step is confirmed before the next begins, and success is only
   * reported once every step has been confirmed. The created vault is
   * persisted as soon as its id is known, so a later failure never loses it.
   */
  const deployVault = useCallback(
    async (vaultId: string): Promise<TransactionState> => {
      const prepared = preflightDraft(vaultId);
      if ("state" in prepared) {
        setTransaction(prepared.state);
        return prepared.state;
      }
      const { vault, address } = prepared;

      const assetContractId = vault.asset.contractId || contractConfig.assetContractId || "";
      if (!assetContractId) {
        const state = failure(
          "No asset contract is configured for this vault. Set NEXT_PUBLIC_USDC_CONTRACT_ID.",
        );
        setTransaction(state);
        return state;
      }

      // ── Step 1: create_vault(owner, asset, mode, check_in, grace) → u64 ──
      const created = await runOperations(address, [
        buildCreateVaultOp({
          owner: address,
          assetContractId,
          activationMode: activationModeFromTrigger(vault.activation.trigger),
          checkInPeriodSeconds: Math.round(vault.activation.checkInIntervalDays * 86_400),
          gracePeriodSeconds: Math.round(vault.activation.gracePeriodDays * 86_400),
        }),
      ]);
      if (!created.ok) {
        setTransaction(created.state);
        return created.state;
      }

      let onChainId: string;
      try {
        onChainId = readVaultIdFromReturnValue(created.result.returnValue);
      } catch (decodeError) {
        const state: TransactionState = {
          phase: "failed",
          hash: created.result.hash,
          error:
            `The vault was created on-chain (transaction ${created.result.hash}) but its id ` +
            `could not be read back: ${
              decodeError instanceof Error ? decodeError.message : String(decodeError)
            } Refresh the dashboard to find it.`,
        };
        setTransaction(state);
        return state;
      }

      // Persist the deployed vault immediately, under its on-chain id.
      const deployed: Vault = {
        ...vault,
        id: onChainId,
        contractId: contractConfig.contractId ?? undefined,
        status: "active",
        lastCheckInAt: new Date().toISOString(),
        transactions: [...vault.transactions, historyEntry("deploy", created.result)],
      };
      deployed.nextCheckInDueAt = deriveVaultState(deployed, new Date()).nextCheckInDueAt;

      try {
        await removeVault(vault.id);
        await saveVault(deployed);
      } catch (persistError) {
        const state: TransactionState = {
          phase: "failed",
          hash: created.result.hash,
          error:
            `Vault ${onChainId} was created (transaction ${created.result.hash}) but could not be ` +
            `saved locally: ${persistError instanceof Error ? persistError.message : String(persistError)}`,
        };
        setTransaction(state);
        return state;
      }

      const amend = (base: TransactionState, step: string): TransactionState => ({
        ...base,
        error:
          `Vault ${onChainId} was created (transaction ${created.result.hash}), but ${step}: ` +
          `${base.error ?? "unknown error"}`,
      });

      // ── Step 2: add beneficiaries, guardians and the threshold ──
      const configOps: xdr.Operation[] = [
        ...vault.beneficiaries.map((beneficiary) =>
          buildAddBeneficiaryOp({
            vaultId: onChainId,
            beneficiaryAddress: beneficiary.address,
            allocationBps: beneficiary.allocationBps,
          }),
        ),
        ...vault.guardians.map((guardian) =>
          buildAddGuardianOp({ vaultId: onChainId, guardianAddress: guardian.address }),
        ),
      ];
      if (vault.guardians.length > 0) {
        // `set_guardian_threshold` requires 1 <= threshold <= active guardians;
        // validation keeps the draft inside that range, and the contract is the
        // final authority.
        configOps.push(
          buildSetGuardianThresholdOp({
            vaultId: onChainId,
            threshold: vault.activation.guardianThreshold,
          }),
        );
      }

      if (configOps.length > 0) {
        const configured = await runOperations(address, configOps);
        if (!configured.ok) {
          const state = amend(configured.state, "configuring its beneficiaries/guardians failed");
          setTransaction(state);
          return state;
        }
        const entries: VaultTransaction[] = [];
        if (vault.beneficiaries.length > 0) {
          entries.push(historyEntry("beneficiary-update", configured.result));
        }
        if (vault.guardians.length > 0) {
          entries.push(historyEntry("guardian-update", configured.result));
        }
        entries.forEach((entry) => {
          deployed.transactions = recordTransaction(deployed, entry).transactions;
        });
        await saveVault(deployed);
      }

      // ── Step 3: first deposit (the contract creates the vault unfunded) ──
      const amount = toBaseUnits(vault.asset.amount || "0", vault.asset.decimals);
      if (amount > 0n) {
        const funded = await runOperations(address, [
          buildDepositOp({ vaultId: onChainId, assetContractId, amount }),
        ]);
        if (!funded.ok) {
          const state = amend(funded.state, "the first deposit failed");
          setTransaction(state);
          return state;
        }
        deployed.asset = { ...deployed.asset, amount: vault.asset.amount };
        deployed.transactions = recordTransaction(
          deployed,
          historyEntry("deposit", funded.result),
        ).transactions;
        await saveVault(deployed);
      }

      const lastEntry = deployed.transactions[deployed.transactions.length - 1];
      const state: TransactionState = {
        phase: "success",
        hash: lastEntry?.hash ?? created.result.hash,
        ledger: lastEntry?.ledger ?? created.result.ledger,
      };
      setTransaction(state);
      return state;
    },
    [contractConfig.assetContractId, contractConfig.contractId, preflightDraft, removeVault, runOperations, saveVault],
  );

  const checkIn = useCallback(
    (vaultId: string) =>
      execute(
        vaultId,
        "check-in",
        (vault) => [buildCheckInOp({ vaultId: vault.id })],
        (vault) => {
          const withCheckIn: Vault = {
            ...vault,
            lastCheckInAt: new Date().toISOString(),
            status: "active",
          };
          return {
            ...withCheckIn,
            nextCheckInDueAt: deriveVaultState(withCheckIn, new Date()).nextCheckInDueAt,
          };
        },
      ),
    [execute],
  );

  const deposit = useCallback(
    (vaultId: string, amount: string) =>
      execute(
        vaultId,
        "deposit",
        (vault) => [
          buildDepositOp({
            vaultId: vault.id,
            assetContractId: vault.asset.contractId || contractConfig.assetContractId || "",
            amount: toBaseUnits(amount, vault.asset.decimals),
          }),
        ],
        (vault) => ({
          ...vault,
          asset: {
            ...vault.asset,
            amount: (Number(vault.asset.amount) + Number(amount)).toFixed(
              Math.min(vault.asset.decimals, 7),
            ),
          },
        }),
      ),
    [contractConfig.assetContractId, execute],
  );

  const cancelVault = useCallback(
    (vaultId: string) =>
      execute(
        vaultId,
        "cancel",
        (vault) => [buildCancelVaultOp({ vaultId: vault.id })],
        (vault) => ({ ...vault, status: "cancelled", cancelledAt: new Date().toISOString() }),
      ),
    [execute],
  );

  /** A guardian records its approval of the current activation attempt. */
  const approveActivation = useCallback(
    (vaultId: string) =>
      execute(
        vaultId,
        "guardian-approval",
        (vault, address) => [buildGuardianApproveOp({ vaultId: vault.id, guardianAddress: address })],
        (vault) => {
          const approver = wallet.address ?? "";
          return {
            ...vault,
            activationApprovals: Array.from(new Set([...vault.activationApprovals, approver])),
            guardians: vault.guardians.map((guardian) =>
              guardian.address === approver
                ? { ...guardian, approvalStatus: "approved" as const }
                : guardian,
            ),
          };
        },
      ),
    [execute, wallet.address],
  );

  /** Permissionless `activate_vault`; the contract re-checks every condition. */
  const triggerActivation = useCallback(
    (vaultId: string) =>
      execute(
        vaultId,
        "activation",
        (vault) => [buildActivateVaultOp({ vaultId: vault.id })],
        (vault) => ({ ...vault, status: "triggered", activatedAt: new Date().toISOString() }),
      ),
    [execute],
  );

  const claim = useCallback(
    (vaultId: string, beneficiaryAddress: string) =>
      execute(
        vaultId,
        "claim",
        (vault) => [buildClaimOp({ vaultId: vault.id, beneficiaryAddress })],
        (vault, hash) => ({
          ...vault,
          claims: (vault.claims ?? []).map((entry) =>
            entry.address === beneficiaryAddress
              ? {
                  ...entry,
                  status: "claimed" as const,
                  claimTxHash: hash,
                  claimedAt: new Date().toISOString(),
                }
              : entry,
          ),
        }),
      ),
    [execute],
  );

  const value = useMemo<VaultContextValue>(
    () => ({
      vaults,
      loading,
      error,
      dataSource: repository.source,
      isDevelopmentData: repository.source === "development-fixtures",
      contractConfigured,
      networkLabel: network.label,
      transaction,
      refresh,
      getVault,
      saveDraft,
      saveVault,
      removeVault,
      resetTransaction: () => setTransaction(IDLE_TRANSACTION),
      deployVault,
      checkIn,
      deposit,
      cancelVault,
      approveActivation,
      triggerActivation,
      claim,
    }),
    [
      vaults,
      loading,
      error,
      repository.source,
      contractConfigured,
      network.label,
      transaction,
      refresh,
      getVault,
      saveDraft,
      saveVault,
      removeVault,
      deployVault,
      checkIn,
      deposit,
      cancelVault,
      approveActivation,
      triggerActivation,
      claim,
    ],
  );

  // `createElement` keeps this file free of JSX so it can remain a `.ts` module.
  return createElement(VaultContext.Provider, { value }, children);
}

export function useVaultContext(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error("useVault must be used within a <VaultProvider>.");
  }
  return context;
}

/** Access the full vault store. */
export function useVault(): VaultContextValue {
  return useVaultContext();
}

/**
 * Select a single vault by id, with its derived live state.
 * Returns `null` while loading or when the id is unknown.
 */
export function useVaultById(id: string | undefined) {
  const { getVault, loading } = useVaultContext();
  const vault = id ? getVault(id) : undefined;

  return useMemo(() => {
    if (!vault) return { vault: null, state: null, loading, notFound: !loading && !!id };
    return { vault, state: deriveVaultState(vault), loading, notFound: false };
  }, [id, loading, vault]);
}
