/**
 * Stellar client factories.
 *
 * This module owns the only place where network connections are created.
 * Nothing else in the app should instantiate an RPC or Horizon server, so
 * that a change of SDK or endpoint only touches this file.
 */

import { Horizon, rpc } from "@stellar/stellar-sdk";

import { getNetworkConfig, type StellarNetworkConfig, type StellarNetworkId } from "./network";

let cachedRpc: { key: string; server: rpc.Server } | null = null;
let cachedHorizon: { key: string; server: Horizon.Server } | null = null;

/** Lazily-created, cached Soroban RPC server for the active network. */
export function getRpcServer(override?: StellarNetworkId): rpc.Server {
  const config = getNetworkConfig(override);
  if (!cachedRpc || cachedRpc.key !== config.rpcUrl) {
    cachedRpc = { key: config.rpcUrl, server: new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith("http://") }) };
  }
  return cachedRpc.server;
}

/** Lazily-created, cached Horizon server for the active network. */
export function getHorizonServer(override?: StellarNetworkId): Horizon.Server {
  const config = getNetworkConfig(override);
  if (!cachedHorizon || cachedHorizon.key !== config.horizonUrl) {
    cachedHorizon = {
      key: config.horizonUrl,
      server: new Horizon.Server(config.horizonUrl, { allowHttp: config.horizonUrl.startsWith("http://") }),
    };
  }
  return cachedHorizon.server;
}

export interface RpcHealth {
  reachable: boolean;
  status?: string;
  latestLedger?: number;
  error?: string;
}

/**
 * Probe the configured RPC endpoint. Used by the UI to show an honest
 * connectivity indicator rather than assuming the network is reachable.
 */
export async function checkRpcHealth(override?: StellarNetworkId): Promise<RpcHealth> {
  try {
    const server = getRpcServer(override);
    const health = await server.getHealth();
    const latest = await server.getLatestLedger();
    return {
      reachable: true,
      status: health.status,
      latestLedger: latest?.sequence,
    };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Read the native XLM balance for a Stellar account via Horizon. */
export async function fetchAccountBalances(
  address: string,
  override?: StellarNetworkId,
): Promise<{ asset: string; balance: string }[]> {
  const server = getHorizonServer(override);
  const account = await server.loadAccount(address);
  return account.balances.map((entry) => {
    const code =
      entry.asset_type === "native" ? "XLM" : ("asset_code" in entry ? entry.asset_code : "unknown");
    return { asset: code, balance: entry.balance };
  });
}

export type { StellarNetworkConfig };
