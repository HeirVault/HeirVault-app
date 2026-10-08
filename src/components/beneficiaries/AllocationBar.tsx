"use client";

import { cn } from "@/lib/cn";
import { bpsToPercent } from "@/lib/vault/calculations";
import { TOTAL_ALLOCATION_BPS, type Beneficiary } from "@/lib/vault/types";

const SEGMENT_COLOURS = [
  "bg-brand-500",
  "bg-accent-500",
  "bg-brand-300",
  "bg-warning-500",
  "bg-success-500",
  "bg-brand-700",
  "bg-danger-500",
  "bg-slate-400",
];

export interface AllocationBarProps {
  beneficiaries: Beneficiary[];
  className?: string;
}

/** Stacked bar showing how the vault is divided. Purely presentational. */
export function AllocationBar({ beneficiaries, className }: AllocationBarProps) {
  const total = beneficiaries.reduce((sum, b) => sum + b.allocationBps, 0);
  const unallocated = Math.max(0, TOTAL_ALLOCATION_BPS - total);

  return (
    <div className={className}>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-surface-raised"
        role="img"
        aria-label={`Allocation: ${beneficiaries
          .map((b) => `${b.label ?? b.address.slice(0, 6)} ${bpsToPercent(b.allocationBps)}%`)
          .join(", ")}${unallocated > 0 ? `, ${bpsToPercent(unallocated)}% unallocated` : ""}`}
      >
        {beneficiaries.map((beneficiary, index) => (
          <div
            key={beneficiary.id}
            className={cn("h-full", SEGMENT_COLOURS[index % SEGMENT_COLOURS.length])}
            style={{ width: `${bpsToPercent(beneficiary.allocationBps)}%` }}
          />
        ))}
        {unallocated > 0 && (
          <div
            className="h-full bg-[repeating-linear-gradient(45deg,theme(colors.slate.300)_0_4px,theme(colors.slate.200)_4px_8px)]"
            style={{ width: `${bpsToPercent(unallocated)}%` }}
          />
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {beneficiaries.map((beneficiary, index) => (
          <li key={beneficiary.id} className="flex items-center gap-1.5 text-xs text-muted">
            <span
              aria-hidden
              className={cn("h-2 w-2 rounded-full", SEGMENT_COLOURS[index % SEGMENT_COLOURS.length])}
            />
            {beneficiary.label ?? beneficiary.address.slice(0, 8)}
            <span className="font-medium text-content">{bpsToPercent(beneficiary.allocationBps)}%</span>
          </li>
        ))}
        {unallocated > 0 && (
          <li className="flex items-center gap-1.5 text-xs text-warning-700">
            <span aria-hidden className="h-2 w-2 rounded-full bg-slate-300" />
            {bpsToPercent(unallocated)}% unallocated
          </li>
        )}
      </ul>
    </div>
  );
}
