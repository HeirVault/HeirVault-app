import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-raised text-content border-border",
  info: "bg-brand-50 text-brand-700 border-brand-200",
  brand: "bg-brand-600 text-white border-brand-600",
  success: "bg-success-100 text-success-700 border-success-500/30",
  warning: "bg-warning-100 text-warning-700 border-warning-500/30",
  danger: "bg-danger-100 text-danger-700 border-danger-500/30",
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  /** Renders a small dot before the label. */
  dot?: boolean;
  title?: string;
}

export function Badge({ tone = "neutral", children, className, dot = false, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
