import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type AlertTone = "info" | "success" | "warning" | "danger" | "neutral";

const TONES: Record<AlertTone, { wrapper: string; icon: string; title: string }> = {
  neutral: { wrapper: "border-border bg-surface-raised", icon: "text-muted", title: "text-content-strong" },
  info: { wrapper: "border-brand-200 bg-brand-50", icon: "text-brand-600", title: "text-brand-800" },
  success: { wrapper: "border-success-500/30 bg-success-100/60", icon: "text-success-700", title: "text-success-700" },
  warning: { wrapper: "border-warning-500/30 bg-warning-100/60", icon: "text-warning-700", title: "text-warning-700" },
  danger: { wrapper: "border-danger-500/30 bg-danger-100/60", icon: "text-danger-700", title: "text-danger-700" },
};

const ICONS: Record<AlertTone, string> = {
  neutral: "M12 8h.01M11 12h1v4h1",
  info: "M12 8h.01M11 12h1v4h1",
  success: "m5 13 4 4L19 7",
  warning: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  danger: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Announce changes to screen readers. Defaults to true for warning/danger. */
  live?: boolean;
}

export function Alert({ tone = "info", title, children, action, className, live }: AlertProps) {
  const isUrgent = tone === "danger" || tone === "warning";
  const shouldAnnounce = live ?? isUrgent;

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      aria-live={shouldAnnounce ? (tone === "danger" ? "assertive" : "polite") : "off"}
      className={cn("flex gap-3 rounded-xl border p-4", TONES[tone].wrapper, className)}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("mt-0.5 h-5 w-5 shrink-0", TONES[tone].icon)}
      >
        <circle cx="12" cy="12" r="9" className="opacity-40" />
        <path d={ICONS[tone]} />
      </svg>
      <div className="min-w-0 flex-1">
        {title && <p className={cn("text-sm font-semibold", TONES[tone].title)}>{title}</p>}
        {children && <div className="mt-1 text-sm text-content [&_a]:underline">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-start">{action}</div>}
    </div>
  );
}
