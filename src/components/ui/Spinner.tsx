import { cn } from "@/lib/cn";

export interface SpinnerProps {
  className?: string;
  label?: string;
  "aria-hidden"?: boolean;
}

export function Spinner({ className, label = "Loading", "aria-hidden": ariaHidden }: SpinnerProps) {
  return (
    <span
      role={ariaHidden ? undefined : "status"}
      aria-hidden={ariaHidden}
      className={cn("inline-flex items-center gap-2", className)}
    >
      <svg
        className={cn("h-4 w-4 animate-spin", className)}
        viewBox="0 0 24 24"
        fill="none"
        focusable="false"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
        />
      </svg>
      {!ariaHidden && <span className="sr-only">{label}</span>}
    </span>
  );
}
