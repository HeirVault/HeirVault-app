/**
 * Network configuration tests.
 *
 * `network.ts` reads `NEXT_PUBLIC_*` variables at import time, so each test
 * stubs the environment, resets the module registry and re-imports to get a
 * deterministic configuration.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "NEXT_PUBLIC_STELLAR_NETWORK",
  "NEXT_PUBLIC_STELLAR_RPC_URL",
  "NEXT_PUBLIC_STELLAR_HORIZON_URL",
  "NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE",
  "NEXT_PUBLIC_EXPLORER_BASE_URL",
] as const;

async function loadNetwork(env: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) {
  vi.resetModules();
  for (const key of ENV_KEYS) vi.stubEnv(key, env[key] ?? "");
  return import("./network");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("defaults", () => {
  it("defaults to testnet with canonical endpoints", async () => {
    const net = await loadNetwork();
    const config = net.getNetworkConfig();

    expect(config.id).toBe("testnet");
    expect(config.label).toBe("Stellar Testnet");
    expect(config.isMainnet).toBe(false);
    expect(config.passphrase).toBe("Test SDF Network ; September 2015");
    expect(config.rpcUrl).toBe("https://soroban-testnet.stellar.org");
    expect(config.horizonUrl).toBe("https://horizon-testnet.stellar.org");
    expect(config.explorerBaseUrl).toBe("https://stellar.expert/explorer/testnet");
  });

  it("falls back to testnet for an unknown network id", async () => {
    const net = await loadNetwork({ NEXT_PUBLIC_STELLAR_NETWORK: "not-a-network" });
    expect(net.ACTIVE_NETWORK_ID).toBe("testnet");
  });

  it("normalises case and whitespace in the network id", async () => {
    const net = await loadNetwork({ NEXT_PUBLIC_STELLAR_NETWORK: "  MAINNET  " });
    expect(net.ACTIVE_NETWORK_ID).toBe("mainnet");
  });
});

describe("environment overrides", () => {
  it("uses configured endpoints for the active network", async () => {
    const net = await loadNetwork({
      NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
      NEXT_PUBLIC_STELLAR_RPC_URL: "https://rpc.internal",
      NEXT_PUBLIC_STELLAR_HORIZON_URL: "https://horizon.internal",
      NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: "Custom Passphrase",
      NEXT_PUBLIC_EXPLORER_BASE_URL: "https://explorer.internal/",
    });
    const config = net.getNetworkConfig();

    expect(config.rpcUrl).toBe("https://rpc.internal");
    expect(config.horizonUrl).toBe("https://horizon.internal");
    expect(config.passphrase).toBe("Custom Passphrase");
    expect(config.explorerBaseUrl).toBe("https://explorer.internal/");
  });

  it("ignores configured endpoints when resolving a different network", async () => {
    const net = await loadNetwork({
      NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
      NEXT_PUBLIC_STELLAR_RPC_URL: "https://rpc.internal",
    });
    const mainnet = net.getNetworkConfig("mainnet");

    expect(mainnet.rpcUrl).toBe("https://mainnet.sorobanrpc.com");
    expect(mainnet.passphrase).toBe("Public Global Stellar Network ; September 2015");
    expect(mainnet.isMainnet).toBe(true);
  });
});

describe("per-network configuration", () => {
  it("resolves each network's canonical passphrase", async () => {
    const net = await loadNetwork();
    expect(net.getNetworkPassphrase("testnet")).toBe("Test SDF Network ; September 2015");
    expect(net.getNetworkPassphrase("mainnet")).toBe("Public Global Stellar Network ; September 2015");
    expect(net.getNetworkPassphrase("futurenet")).toBe("Test SDF Future Network ; October 2022");
    expect(net.getNetworkPassphrase("standalone")).toBe("Standalone Network ; February 2017");
  });

  it("leaves standalone without an explorer", async () => {
    const net = await loadNetwork();
    expect(net.getNetworkConfig("standalone").explorerBaseUrl).toBe("");
    expect(net.getNetworkConfig("standalone").isMainnet).toBe(false);
  });
});

describe("network id helpers", () => {
  it("recognises valid ids", async () => {
    const net = await loadNetwork();
    expect(net.isNetworkId("futurenet")).toBe(true);
    expect(net.isNetworkId("mainnet")).toBe(true);
    expect(net.isNetworkId("bogus")).toBe(false);
  });

  it("returns human labels", async () => {
    const net = await loadNetwork();
    expect(net.networkLabel("futurenet")).toBe("Stellar Futurenet");
    expect(net.networkLabel("standalone")).toBe("Local / Standalone");
  });
});
