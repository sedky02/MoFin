import { cn } from "@/lib/utils";
import type { GoalTone } from "@/lib/goal-standing";

const FILL: Record<GoalTone, string> = {
  failed: "bg-destructive",
  behind: "bg-warning",
  "on-track": "bg-orange-400",
  achieved: "bg-[color-mix(in_oklab,var(--primary)_88%,black)] dark:bg-primary",
  cancelled: "bg-muted-foreground/50",
};

/** A full-width bar coloured by where the goal stands. */
export function GoalProgressBar({
  ratio,
  tone,
  valueText,
  className,
}: {
  /** 0-100, how much of the bar to fill. */
  ratio: number;
  tone: GoalTone;
  /** What a screen reader hears, e.g. "69% of the limit used, 27% of the period gone". */
  valueText: string;
  className?: string;
}) {
  const filled = Math.min(100, Math.max(0, ratio));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(filled)}
      aria-valuetext={valueText}
      aria-label="Goal progress"
      className={cn("relative h-1.5 w-full rounded-full bg-foreground/[0.07]", className)}
    >
      <div className={cn("h-full rounded-full transition-[width]", FILL[tone])} style={{ width: `${filled}%` }} />
    </div>
  );
}
