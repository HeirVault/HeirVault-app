"use client";

import { useState } from "react";

import { copyToClipboard } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyButton({ value, label = "Copy", className }: CopyButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function handleCopy() {
    const copied = await copyToClipboard(value);
    setStatus(copied ? "copied" : "error");
    window.setTimeout(() => setStatus("idle"), 1800);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted transition hover:bg-surface-raised hover:text-content-strong",
        className,
      )}
      aria-label={`${label} to clipboard`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h8" strokeLinecap="round" />
      </svg>
      <span aria-live="polite">
        {status === "copied" ? "Copied" : status === "error" ? "Failed" : label}
      </span>
    </button>
  );
}
