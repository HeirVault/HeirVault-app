import { cn } from "@/lib/cn";

export interface StepperStep {
  id: string;
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  currentIndex: number;
  /** Called when the user jumps to an already-completed step. */
  onSelect?: (index: number) => void;
  className?: string;
}

export function Stepper({ steps, currentIndex, onSelect, className }: StepperProps) {
  return (
    <nav aria-label="Vault creation progress" className={className}>
      <ol className="flex flex-wrap gap-x-2 gap-y-2">
        {steps.map((step, index) => {
          const state = index === currentIndex ? "current" : index < currentIndex ? "complete" : "upcoming";
          const interactive = state === "complete" && onSelect;
          return (
            <li key={step.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={interactive ? () => onSelect?.(index) : undefined}
                disabled={!interactive}
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  state === "current" && "border-brand-500 bg-brand-50 text-brand-800",
                  state === "complete" && "border-success-500/30 bg-success-100/60 text-success-700",
                  state === "upcoming" && "border-border bg-surface text-muted",
                  interactive && "cursor-pointer hover:border-brand-400",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                    state === "current" && "bg-brand-600 text-white",
                    state === "complete" && "bg-success-500 text-white",
                    state === "upcoming" && "bg-surface-raised text-muted",
                  )}
                >
                  {state === "complete" ? "✓" : index + 1}
                </span>
                <span>{step.label}</span>
              </button>
              {index < steps.length - 1 && (
                <span aria-hidden className="hidden h-px w-4 bg-border sm:block" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
