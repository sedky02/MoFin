import { cn } from "@/lib/utils";

/** MoFin wordmark: a champagne mark with a ledger stroke. */
export function Logo({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="size-5"
          aria-hidden="true"
        >
          <path
            d="M4 17V11l5 4 6-8 5 6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {showText && (
        <span className="text-xl font-semibold tracking-[-0.02em]">
          Mo<span className="text-primary-text">Fin</span>
        </span>
      )}
    </span>
  );
}
