"use client";

import { truncateMiddle } from "@/lib/format";
import { getAccountUrl, getContractUrl } from "@/lib/stellar/explorer";
import { cn } from "@/lib/cn";

import { CopyButton } from "./CopyButton";

export interface AddressDisplayProps {
  address: string;
  /** `account` builds a Horizon explorer link, `contract` a contract link. */
  kind?: "account" | "contract";
  label?: string;
  className?: string;
  showCopy?: boolean;
  /** Show the full address instead of a truncated one. */
  full?: boolean;
}

export function AddressDisplay({
  address,
  kind = "account",
  label,
  className,
  showCopy = true,
  full = false,
}: AddressDisplayProps) {
  if (!address) {
    return <span className="text-xs text-muted">Not set</span>;
  }

  const url = kind === "contract" ? getContractUrl(address) : getAccountUrl(address);
  const display = full ? address : truncateMiddle(address, 5);

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      {label && <span className="text-xs text-muted">{label}</span>}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-content-strong underline-offset-2 hover:text-brand-700 hover:underline"
          title={address}
        >
          {display}
        </a>
      ) : (
        <span className="font-mono text-xs text-content-strong" title={address}>
          {display}
        </span>
      )}
      {showCopy && <CopyButton value={address} label="Copy address" />}
    </span>
  );
}
