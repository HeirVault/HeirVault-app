"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import type { Vault } from "@/lib/vault/types";

import { VaultCard } from "./VaultCard";

export interface VaultListProps {
  vaults: Vault[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  className?: string;
}

export function VaultList({
  vaults,
  loading = false,
  emptyTitle = "No vaults yet",
  emptyDescription = "Create an inheritance vault to define how your assets reach the people you care about.",
  emptyAction,
  className,
}: VaultListProps) {
  if (loading) {
    return (
      <div className={className} aria-busy="true" aria-label="Loading vaults">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (vaults.length === 0) {
    return (
      <EmptyState
        className={className}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        icon={
          <svg aria-hidden viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="6" width="18" height="14" rx="2" />
            <path d="M3 10h18M8 15h3" strokeLinecap="round" />
          </svg>
        }
      />
    );
  }

  return (
    <div className={className}>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {vaults.map((vault) => (
          <li key={vault.id} className="flex">
            <div className="flex w-full">
              <div className="flex w-full flex-col [&>article]:flex-1">
                <VaultCard vault={vault} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
