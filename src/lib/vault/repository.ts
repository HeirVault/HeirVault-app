/**
 * Vault persistence.
 *
 * The UI never talks to a storage backend directly; it talks to a
 * {@link VaultRepository}. Two implementations ship today:
 *
 *  - {@link LocalVaultRepository}    — localStorage (or in-memory fallback),
 *                                      optionally seeded with development
 *                                      fixtures. Used until a real contract is
 *                                      configured.
 *  - {@link SorobanVaultRepository}  — reads vault state from the HeirVault
 *                                      contract. This is the *only* code path
 *                                      that represents real blockchain state,
 *                                      and it refuses to fabricate anything.
 *
 * Swapping the repository is how this frontend becomes fully contract-backed.
 */

import { ContractNotConfiguredError, isContractConfigured } from "@/lib/stellar/config";
import { getNetworkConfig } from "@/lib/stellar/network";

import { areDevFixturesEnabled, DEVELOPMENT_FIXTURES } from "./mock-data";
import type { Vault, VaultDraft } from "./types";

export type VaultDataSource =
  | "development-fixtures"
  | "local-storage"
  | "memory"
  | "soroban-contract";

export interface VaultRepository {
  readonly source: VaultDataSource;
  list(): Promise<Vault[]>;
  get(id: string): Promise<Vault | null>;
  save(vault: Vault): Promise<Vault>;
  remove(id: string): Promise<void>;
}

const STORAGE_KEY = "heirvault.vaults.v1";

/** Prefer `crypto.randomUUID`; fall back to a timestamped id. */
export function generateId(prefix = "vault"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

/**
 * localStorage-backed repository with an in-memory fallback for SSR, private
 * browsing modes and tests.
 */
export class LocalVaultRepository implements VaultRepository {
  readonly source: VaultDataSource;

  private memory: Vault[] | null = null;

  constructor(private readonly options: { seedFixtures?: boolean; owner?: string } = {}) {
    this.source = hasLocalStorage() ? "local-storage" : "memory";
  }

  private read(): Vault[] {
    if (this.memory) return this.memory;

    if (this.source === "memory") {
      this.memory = this.options.seedFixtures && areDevFixturesEnabled()
        ? structuredCloneSafe(DEVELOPMENT_FIXTURES)
        : [];
      return this.memory;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      this.memory = raw ? (JSON.parse(raw) as Vault[]) : [];
    } catch {
      this.memory = [];
    }

    if (this.memory.length === 0 && this.options.seedFixtures && areDevFixturesEnabled()) {
      this.memory = structuredCloneSafe(DEVELOPMENT_FIXTURES);
      this.write(this.memory);
    }

    return this.memory;
  }

  private write(vaults: Vault[]): void {
    this.memory = vaults;
    if (this.source !== "local-storage") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vaults));
    } catch {
      // Storage may be full or blocked; the in-memory copy stays authoritative
      // for this session and the UI continues to work.
    }
  }

  async list(): Promise<Vault[]> {
    return this.read();
  }

  async get(id: string): Promise<Vault | null> {
    return this.read().find((vault) => vault.id === id) ?? null;
  }

  async save(vault: Vault): Promise<Vault> {
    const vaults = this.read();
    const index = vaults.findIndex((existing) => existing.id === vault.id);
    if (index >= 0) {
      vaults[index] = vault;
    } else {
      vaults.push(vault);
    }
    this.write(vaults);
    return vault;
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((vault) => vault.id !== id));
  }
}

/**
 * Contract-backed repository.
 *
 * Reads vault state directly from the HeirVault Soroban contract. It is wired
 * to the RPC endpoint but intentionally throws when the contract is not
 * configured, rather than returning local data dressed up as chain state.
 *
 * NOTE: mapping the contract's `get_vault` return value into the domain
 * `Vault` shape depends on the contract's published ABI. That mapping is the
 * remaining integration task in `heirvault-contracts` and is marked in the
 * README. Until it exists, this repository refuses to guess.
 */
export class SorobanVaultRepository implements VaultRepository {
  readonly source = "soroban-contract" as const;

  async list(): Promise<Vault[]> {
    // Loaded lazily so the SDK is not part of the initial client bundle.
    const { getContract, HEIRVAULT_METHODS } = await import("@/lib/stellar/contract");
    getContract();
    throw new Error(
      "Reading a vault list from the HeirVault contract requires the " +
        `${HEIRVAULT_METHODS.listVaultsByOwner} return ABI. ` +
        "Implement the ScVal → Vault mapping in SorobanVaultRepository once " +
        "heirvault-contracts publishes it.",
    );
  }

  async get(): Promise<Vault | null> {
    const { getContract, HEIRVAULT_METHODS } = await import("@/lib/stellar/contract");
    getContract();
    throw new Error(
      "Reading a vault from the HeirVault contract requires the " +
        `${HEIRVAULT_METHODS.getVault} return ABI. ` +
        "Implement the ScVal → Vault mapping in SorobanVaultRepository once " +
        "heirvault-contracts publishes it.",
    );
  }

  async save(vault: Vault): Promise<Vault> {
    // Writes go through `transactions.ts` + `contract.ts`, never the repository.
    return vault;
  }

  async remove(): Promise<void> {
    throw new Error("Vaults cannot be removed on-chain; they are cancelled instead.");
  }
}

/** Choose the repository appropriate for the current configuration. */
export function createDefaultRepository(options: { owner?: string } = {}): VaultRepository {
  if (isContractConfigured()) {
    return new SorobanVaultRepository();
  }
  return new LocalVaultRepository({ seedFixtures: true, ...options });
}

/** Build a `draft` vault from wizard output, owned by `owner`. */
export function createVaultFromDraft(
  draft: VaultDraft,
  owner: string,
  options: { id?: string } = {},
): Vault {
  const now = new Date().toISOString();
  return {
    id: options.id ?? generateId("vault"),
    owner,
    name: draft.name.trim(),
    description: draft.description?.trim() || undefined,
    status: "draft",
    network: getNetworkConfig().id,
    createdAt: now,
    asset: { ...draft.asset },
    beneficiaries: draft.beneficiaries.map((beneficiary) => ({ ...beneficiary })),
    guardians: draft.guardians.map((guardian) => ({ ...guardian })),
    activation: { ...draft.activation },
    activationApprovals: [],
    nextCheckInDueAt: undefined,
    transactions: [],
    claims: draft.beneficiaries.map((beneficiary) => ({
      beneficiaryId: beneficiary.id,
      address: beneficiary.address,
      status: "not-eligible",
    })),
  };
}

/** An empty wizard draft. */
export function createEmptyDraft(asset: { contractId: string; symbol: string; decimals: number }): VaultDraft {
  return {
    name: "",
    description: "",
    asset: { ...asset, amount: "" },
    beneficiaries: [],
    guardians: [],
    activation: {
      trigger: "missed-check-in",
      checkInIntervalDays: 90,
      gracePeriodDays: 30,
      guardianThreshold: 1,
      emergencyActivationEnabled: false,
    },
  };
}

/** `structuredClone` is unavailable in some test runtimes. */
function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export { ContractNotConfiguredError };
