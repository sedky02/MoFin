import { cn } from "@/lib/utils";

/**
 * MoFin logo: the Bar M mark (three bars from the balance chart forming an M, tallest last for the
 * current month) and the "MoFin" wordmark. Built to the logo guidelines: 48-unit grid, wordmark at
 * 0.75 × the mark's height with a 0.25 × gap, ink wordmark on light grounds and lime on dark.
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

/** The mark on its own (lime tile, ink bars). Same drawing as `app/icon.svg`. */
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
