/**
 * Block-explorer link builders.
 *
 * The base URL is environment-driven (`NEXT_PUBLIC_EXPLORER_BASE_URL`), so the
 * app is not tied to a single explorer vendor and works on any network.
 *
 * IMPORTANT: links are only rendered for transactions the network has actually
 * accepted. Development fixtures use a `fixture-` hash prefix and must never
 * produce a link — {@link getTransactionUrl} returns `null` for them.
 */

import { getNetworkConfig } from "./network";

const ENV_TX_PATH = process.env.NEXT_PUBLIC_EXPLORER_TX_PATH?.trim() || "/tx";
const ENV_ACCOUNT_PATH = process.env.NEXT_PUBLIC_EXPLORER_ACCOUNT_PATH?.trim() || "/account";
const ENV_CONTRACT_PATH = process.env.NEXT_PUBLIC_EXPLORER_CONTRACT_PATH?.trim() || "/contract";

function base(): string {
  return getNetworkConfig().explorerBaseUrl.replace(/\/$/, "");
}

function join(path: string, id: string): string {
  const root = base();
  if (!root) return id;
  return `${root}${path}/${encodeURIComponent(id)}`;
}

/** True when a hash refers to real chain state (not a fixture). */
export function isExplorableHash(hash: string | undefined): boolean {
  if (!hash) return false;
  return !hash.startsWith("fixture-");
}

export function getTransactionUrl(hash: string | undefined): string | null {
  if (!isExplorableHash(hash)) return null;
  if (!base()) return null;
  return join(ENV_TX_PATH, hash as string);
}

export function getAccountUrl(address: string): string | null {
  if (!address || !base()) return null;
  return join(ENV_ACCOUNT_PATH, address);
}

export function getContractUrl(contractId: string | undefined): string | null {
  if (!contractId || !base()) return null;
  return join(ENV_CONTRACT_PATH, contractId);
}

export function getExplorerName(): string {
  const root = base();
  if (!root) return "No explorer configured";
  try {
    return new URL(root).hostname;
  } catch {
    return root;
  }
}
