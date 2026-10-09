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
 * Reads vault state directly from the HeirVault Soroban contract. Chain state
 * is authoritative for everything the contract stores; localStorage only
 * supplies what the contract deliberately does not store (name, description,
 * address labels, guardian roles, and the history of transactions this app
 * submitted) plus drafts that have not been deployed yet.
 *
 * Reads are *simulated* against the configured contract — never submitted —
 * and any result that cannot be decoded throws instead of being fabricated.
 * Writes never go through the repository (see `transactions.ts` +
 * `contract.ts`); `save` only persists the local overlay.
 */
export class SorobanVaultRepository implements VaultRepository {
  readonly source = "soroban-contract" as const;

  constructor(private readonly owner?: string) {}

  async list(): Promise<Vault[]> {
    // Loaded lazily so the SDK is not part of the initial client bundle.
    const contract = await import("@/lib/stellar/contract");
    if (!this.owner) {
      throw new Error("Connect a Stellar wallet to load your on-chain vaults.");
    }

    const local = readLocalVaultStore();
    const localById = new Map(local.map((vault) => [vault.id, vault]));

    const ids: string[] = [];
    let offset = 0;
    // The contract clamps `limit` to 25, so a long-lived owner needs paging.
    for (let page = 0; page < 10; page += 1) {
      const result = await contract.readVaultsByOwner(this.owner, { offset, limit: 25 });
      ids.push(...result.items.map((item) => item.id));
      if (!result.meta.hasMore || result.meta.nextOffset === null) break;
      offset = result.meta.nextOffset;
    }

    const vaults = await mapWithConcurrency(ids, 4, (id) =>
      contract.readDomainVault(id, localById.get(id), this.owner ? { sourceAddress: this.owner } : {}),
    );

    const onChainIds = new Set(vaults.map((vault) => vault.id));
    // Drafts live locally until they are deployed; everything else is only
    // shown when the contract confirms it exists.
    const drafts = local.filter((vault) => vault.status === "draft" && !onChainIds.has(vault.id));

    return [...vaults, ...drafts];
  }

  async get(id: string): Promise<Vault | null> {
    const contract = await import("@/lib/stellar/contract");
    const local = readLocalVaultStore().find((vault) => vault.id === id) ?? null;

    if (!/^\d+$/.test(id)) {
      // Not an on-chain id: only a local draft can match it.
      return local && local.status === "draft" ? local : null;
    }

    try {
      return await contract.readDomainVault(id, local, this.owner ? { sourceAddress: this.owner } : {});
    } catch (error) {
      if (error instanceof contract.ContractReadError && /not found|missing/i.test(error.message)) {
        return local?.status === "draft" ? local : null;
      }
      throw error;
    }
  }

  /**
   * Persist the local overlay (drafts, labels, submitted-transaction history).
   * On-chain state is never written through here.
   */
  async save(vault: Vault): Promise<Vault> {
    writeLocalVaultStore(upsertLocalVault(vault));
    return vault;
  }

  async remove(id: string): Promise<void> {
    if (/^\d+$/.test(id)) {
      throw new Error("Vaults cannot be removed on-chain; they are cancelled instead.");
    }
    writeLocalVaultStore(readLocalVaultStore().filter((vault) => vault.id !== id));
  }
}

/** Run `fn` over `items` with bounded concurrency, preserving input order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
}

/** Read the local vault store (localStorage, or memory outside the browser). */
function readLocalVaultStore(): Vault[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Vault[]) : [];
  } catch {
    return [];
  }
}

function writeLocalVaultStore(vaults: Vault[]): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vaults));
  } catch {
    // Storage may be full or blocked; the local overlay is best-effort only.
  }
}

function upsertLocalVault(vault: Vault): Vault[] {
  const vaults = readLocalVaultStore();
  const index = vaults.findIndex((entry) => entry.id === vault.id);
  if (index >= 0) {
    vaults[index] = vault;
  } else {
    vaults.push(vault);
  }
  return vaults;
}

/** Choose the repository appropriate for the current configuration. */
export function createDefaultRepository(options: { owner?: string } = {}): VaultRepository {
  if (isContractConfigured()) {
    return new SorobanVaultRepository(options.owner);
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
    },
  };
}

/** `structuredClone` is unavailable in some test runtimes. */
function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export { ContractNotConfiguredError };
