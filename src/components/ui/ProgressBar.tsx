import { cn } from "@/lib/cn";

export interface ProgressBarProps {
  /** Current value; defaults to a 0–100 percentage scale. */
  value: number;
  max?: number;
  label: string;
  className?: string;
  tone?: "brand" | "success" | "warning" | "danger";
  /** Show the numeric percentage beside the bar. */
  showValue?: boolean;
}

const TONES = {
  brand: "bg-brand-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
} as const;

export function ProgressBar({
  value,
  max = 100,
  label,
  className,
  tone = "brand",
  showValue = false,
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.max(0, Math.min(safeMax, value));
  const percent = Math.round((clamped / safeMax) * 100);

  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        aria-valuetext={`${percent}%`}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-raised"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", TONES[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showValue && <p className="mt-1 text-xs text-muted">{percent}%</p>}
    </div>
  );
}
