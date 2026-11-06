import { cn } from "@/lib/utils";

/**
 * The Bar M mark (three balance-chart bars forming an M, tallest last) and the wordmark, built to
 * the logo guidelines (48-unit grid, wordmark 0.75× the mark's height).
 */
export function Logo({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-8" />
      {showText && (
        <span className="font-wordmark text-2xl leading-none font-semibold tracking-[-0.04em] text-brand-ink dark:text-brand-lime">
          MoFin
        </span>
      )}
    </span>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("shrink-0", className)} aria-hidden="true">
      <rect width="48" height="48" rx="12" className="fill-brand-lime" />
      <g className="fill-brand-ink">
        <rect x="10.5" y="18" width="7.5" height="18" rx="2.2" />
        <rect x="20.25" y="25" width="7.5" height="11" rx="2.2" />
        <rect x="30" y="11" width="7.5" height="25" rx="2.2" />
      </g>
    </svg>
  );
}
