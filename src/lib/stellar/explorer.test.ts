/**
 * Explorer link tests.
 *
 * The module captures its base URL and path segments at import time, so each
 * test stubs the environment and re-imports the module.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "NEXT_PUBLIC_STELLAR_NETWORK",
  "NEXT_PUBLIC_EXPLORER_BASE_URL",
  "NEXT_PUBLIC_EXPLORER_TX_PATH",
  "NEXT_PUBLIC_EXPLORER_ACCOUNT_PATH",
  "NEXT_PUBLIC_EXPLORER_CONTRACT_PATH",
] as const;

async function loadExplorer(env: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) {
  vi.resetModules();
  for (const key of ENV_KEYS) vi.stubEnv(key, env[key] ?? "");
  return import("./explorer");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isExplorableHash", () => {
  it("rejects empty and fixture hashes", async () => {
    const explorer = await loadExplorer();
    expect(explorer.isExplorableHash(undefined)).toBe(false);
    expect(explorer.isExplorableHash("")).toBe(false);
    expect(explorer.isExplorableHash("fixture-deploy-hash")).toBe(false);
  });

  it("accepts real transaction hashes", async () => {
    const explorer = await loadExplorer();
    expect(explorer.isExplorableHash("deadbeef")).toBe(true);
  });
});

describe("with a configured explorer", () => {
  const env = {
    NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
    NEXT_PUBLIC_EXPLORER_BASE_URL: "https://example.test/explorer/",
  } as const;

  it("builds transaction, account and contract links", async () => {
    const explorer = await loadExplorer(env);
    expect(explorer.getTransactionUrl("abc123")).toBe("https://example.test/explorer/tx/abc123");
    expect(explorer.getAccountUrl("GABC")).toBe("https://example.test/explorer/account/GABC");
    expect(explorer.getContractUrl("CABC")).toBe("https://example.test/explorer/contract/CABC");
  });

  it("strips a trailing slash from the base URL", async () => {
    const explorer = await loadExplorer(env);
    expect(explorer.getTransactionUrl("abc123")).not.toContain("explorer//tx");
  });

  it("never links a development fixture hash", async () => {
    const explorer = await loadExplorer(env);
    expect(explorer.getTransactionUrl("fixture-deploy-hash")).toBeNull();
    expect(explorer.getTransactionUrl(undefined)).toBeNull();
  });

  it("honours custom path segments and encodes the id", async () => {
    const explorer = await loadExplorer({
      ...env,
      NEXT_PUBLIC_EXPLORER_BASE_URL: "https://example.test",
      NEXT_PUBLIC_EXPLORER_TX_PATH: "/transactions",
    });
    expect(explorer.getTransactionUrl("a/b")).toBe("https://example.test/transactions/a%2Fb");
  });

  it("reports the explorer hostname", async () => {
    const explorer = await loadExplorer(env);
    expect(explorer.getExplorerName()).toBe("example.test");
  });
});

describe("without a configured explorer", () => {
  it("returns null links and a friendly name on standalone", async () => {
    const explorer = await loadExplorer({ NEXT_PUBLIC_STELLAR_NETWORK: "standalone" });
    expect(explorer.getTransactionUrl("abc123")).toBeNull();
    expect(explorer.getAccountUrl("GABC")).toBeNull();
    expect(explorer.getContractUrl("CABC")).toBeNull();
    expect(explorer.getExplorerName()).toBe("No explorer configured");
  });

  it("returns null for empty account and contract ids", async () => {
    const explorer = await loadExplorer({
      NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
      NEXT_PUBLIC_EXPLORER_BASE_URL: "https://example.test",
    });
    expect(explorer.getAccountUrl("")).toBeNull();
    expect(explorer.getContractUrl(undefined)).toBeNull();
  });
});
