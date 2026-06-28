import { cn } from "@/lib/utils";

/** MoFin wordmark. An acid-lime terminal node + ledger stroke. */
export function Logo({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative flex size-8 items-center justify-center rounded bg-primary text-primary-foreground">
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
        <span className="font-heading text-xl font-extrabold tracking-tight">
          Mo<span className="text-primary terminal-glow">Fin</span>
        </span>
      )}
    </span>
  );
}
