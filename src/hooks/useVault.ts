"use client";

/**
 * Vault state + actions.
 *
 * All blockchain writes funnel through {@link execute}, which enforces the
 * honesty rules globally:
 *
 *   1. no wallet        → the action fails with a clear message;
 *   2. no contract id   → `not-configured` state, no network call is made;
 *   3. simulation fails → `failed` with the contract's error;
 *   4. user rejects     → `rejected`, never success;
 *   5. `success` is only reported when Soroban RPC confirms the hash.
 *
 * Vault records in the repository are only updated after (5).
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
  buildApproveActivationOp,
  buildCancelVaultOp,
  buildCheckInOp,
  buildClaimOp,
  buildCreateVaultOp,
  buildDepositOp,
  buildTriggerActivationOp,
  ContractNotConfiguredError,
  getContractConfig,
  isContractConfigured,
} from "@/lib/stellar/contract";
import { getNetworkConfig } from "@/lib/stellar/network";
import {
  buildTransaction,
  IDLE_TRANSACTION,
  prepareTransaction,
  submitSignedTransaction,
  TransactionRejectedError,
  type TransactionState,
} from "@/lib/stellar/transactions";
import { deriveVaultState } from "@/lib/vault/calculations";
import {
  createDefaultRepository,
  createVaultFromDraft,
  type VaultDataSource,
  type VaultRepository,
} from "@/lib/vault/repository";
import type { Vault, VaultDraft, VaultTransactionType } from "@/lib/vault/types";

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

export function VaultProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [repository] = useState<VaultRepository>(() => createDefaultRepository());
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transaction, setTransaction] = useState<TransactionState>(IDLE_TRANSACTION);

  const contractConfig = useMemo(() => getContractConfig(), []);
  const network = useMemo(() => getNetworkConfig(), []);
  const contractConfigured = isContractConfigured();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVaults(await repository.list());
    } catch (listError) {
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

  const saveDraft = useCallback(
    async (draft: VaultDraft, owner: string) => {
      const vault = createVaultFromDraft(draft, owner, {
        id: contractConfigured ? undefined : `local_${Date.now().toString(36)}`,
      });
      await saveVault(vault);
      return vault;
    },
    [contractConfigured, saveVault],
  );

  const removeVault = useCallback(
    async (id: string) => {
      await repository.remove(id);
      setVaults((current) => current.filter((vault) => vault.id !== id));
    },
    [repository],
  );

  /**
   * Build → simulate → sign → submit → confirm, then persist.
   *
   * @param mutate Applied to the stored vault only after on-chain success.
   */
  const execute = useCallback(
    async (
      vaultId: string,
      type: VaultTransactionType,
      buildOp: (vault: Vault, address: string) => xdr.Operation,
      mutate: (vault: Vault, hash: string, ledger?: number) => Vault,
    ): Promise<TransactionState> => {
      setTransaction({ phase: "building" });

      const vault = vaults.find((entry) => entry.id === vaultId);
      if (!vault) {
        const state: TransactionState = { phase: "failed", error: "Vault not found." };
        setTransaction(state);
        return state;
      }
      if (!wallet.address) {
        const state: TransactionState = {
          phase: "failed",
          error: "Connect a Stellar wallet before submitting transactions.",
        };
        setTransaction(state);
        return state;
      }
      if (!wallet.networkMatches) {
        const state: TransactionState = {
          phase: "failed",
          error: `Your wallet is on a different network. Switch it to ${network.label}.`,
        };
        setTransaction(state);
        return state;
      }

      try {
        const operation = buildOp(vault, wallet.address);
        const built = await buildTransaction({
          sourceAddress: wallet.address,
          operations: [operation],
        });
        const prepared = await prepareTransaction(built);

        setTransaction({ phase: "awaiting-signature" });
        let signedXdr: string;
        try {
          signedXdr = await wallet.sign(prepared.transaction.toXDR());
        } catch (signError) {
          const state = toTransactionState(
            signError instanceof TransactionRejectedError
              ? signError
              : new TransactionRejectedError(
                  signError instanceof Error ? signError.message : undefined,
                ),
          );
          setTransaction(state);
          return state;
        }

        setTransaction({ phase: "submitted" });
        const result = await submitSignedTransaction(signedXdr);

        if (result.status === "success") {
          const updated = recordTransaction(mutate(vault, result.hash, result.ledger), {
            hash: result.hash,
            type,
            status: "success",
            ledger: result.ledger,
            timestamp: new Date().toISOString(),
          });
          await saveVault(updated);
          const state: TransactionState = {
            phase: "success",
            hash: result.hash,
            ledger: result.ledger,
          };
          setTransaction(state);
          return state;
        }

        if (result.status === "pending") {
          const state: TransactionState = {
            phase: "pending",
            hash: result.hash,
            error: result.error,
          };
          setTransaction(state);
          return state;
        }

        const state: TransactionState = { phase: "failed", hash: result.hash, error: result.error };
        setTransaction(state);
        return state;
      } catch (actionError) {
        const state = toTransactionState(actionError);
        setTransaction(state);
        return state;
      }
    },
    [network.label, saveVault, vaults, wallet],
  );

  const deployVault = useCallback(
    (vaultId: string) =>
      execute(
        vaultId,
        "deploy",
        (vault, address) =>
          buildCreateVaultOp({
            owner: address,
            name: vault.name,
            assetContractId: vault.asset.contractId || contractConfig.assetContractId || "",
            amount: vault.asset.amount,
            assetDecimals: vault.asset.decimals,
            beneficiaries: vault.beneficiaries,
            guardians: vault.guardians,
            activation: vault.activation,
          }),
        (vault) => ({
          ...vault,
          status: "active",
          lastCheckInAt: new Date().toISOString(),
          nextCheckInDueAt: deriveVaultState(
            { ...vault, lastCheckInAt: new Date().toISOString(), status: "active" },
            new Date(),
          ).nextCheckInDueAt,
        }),
      ),
    [contractConfig.assetContractId, execute],
  );

  const checkIn = useCallback(
    (vaultId: string) =>
      execute(
        vaultId,
        "check-in",
        (vault, address) => buildCheckInOp({ vaultId: vault.id, owner: address }),
        (vault) => {
          const now = new Date().toISOString();
          const withCheckIn: Vault = { ...vault, lastCheckInAt: now, status: "active" };
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
        (vault, address) =>
          buildDepositOp({ vaultId: vault.id, from: address, amount, assetDecimals: vault.asset.decimals }),
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
    [execute],
  );

  const cancelVault = useCallback(
    (vaultId: string) =>
      execute(
        vaultId,
        "cancel",
        (vault, address) => buildCancelVaultOp({ vaultId: vault.id, owner: address }),
        (vault) => ({ ...vault, status: "cancelled", cancelledAt: new Date().toISOString() }),
      ),
    [execute],
  );

  const approveActivation = useCallback(
    (vaultId: string) =>
      execute(
        vaultId,
        "guardian-approval",
        (vault, address) => buildApproveActivationOp({ vaultId: vault.id, guardian: address }),
        (vault) => {
          const approver = wallet.address ?? "";
          return {
            ...vault,
            activationApprovals: Array.from(new Set([...vault.activationApprovals, approver])),
            guardians: vault.guardians.map((guardian) =>
              guardian.address === approver
                ? { ...guardian, approvalStatus: "approved", respondedAt: new Date().toISOString() }
                : guardian,
            ),
          };
        },
      ),
    [execute, wallet.address],
  );

  const triggerActivation = useCallback(
    (vaultId: string) =>
      execute(
        vaultId,
        "activation",
        (vault, address) => buildTriggerActivationOp({ vaultId: vault.id, caller: address }),
        (vault) => ({ ...vault, status: "triggered", activatedAt: new Date().toISOString() }),
      ),
    [execute],
  );

  const claim = useCallback(
    (vaultId: string, beneficiaryAddress: string) =>
      execute(
        vaultId,
        "claim",
        (vault) => buildClaimOp({ vaultId: vault.id, beneficiary: beneficiaryAddress }),
        (vault, hash) => ({
          ...vault,
          claims: (vault.claims ?? []).map((entry) =>
            entry.address === beneficiaryAddress
              ? { ...entry, status: "claimed", claimTxHash: hash, claimedAt: new Date().toISOString() }
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

/** Append a transaction record, keeping the newest entries last. */
function recordTransaction(vault: Vault, transaction: Vault["transactions"][number]): Vault {
  return { ...vault, transactions: [...vault.transactions, transaction] };
}
