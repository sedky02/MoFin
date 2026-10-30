import { cn } from "@/lib/utils";
import type { GoalTone } from "@/lib/goal-standing";

// The ring itself, a soft disc of the same colour behind it, and the text in that colour (a few are a shade
// darker than the ring, to read as text on white).
/** Tones whose progress amount takes the state colour; on track and cancelled rows keep it black. */
export const COLOURED_AMOUNT: GoalTone[] = ["failed", "behind", "achieved"];

export const TONE_STYLE: Record<GoalTone, { ring: string; percent: string }> = {
  failed: { ring: "text-destructive bg-destructive/3", percent: "text-destructive" },
  behind: { ring: "text-warning bg-warning/4", percent: "text-warning" },
  "on-track": {
    ring: "text-orange-400 bg-orange-400/4",
    percent: "text-orange-500 dark:text-orange-400",
  },
  achieved: {
    // The brand lime, with the text mixed a little toward black so it holds up on white.
    ring: "text-[color-mix(in_oklab,var(--primary)_88%,black)] bg-primary/5 dark:text-primary",
    percent: "text-[color-mix(in_oklab,var(--primary)_58%,black)] dark:text-primary",
  },
  cancelled: { ring: "text-muted-foreground bg-muted/40", percent: "text-muted-foreground" },
};

const SIZE = 60;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** A small ring that fills with a goal's progress, coloured by where the goal stands, with the percent inside. */
export function GoalRing({
  ratio,
  percent,
  tone,
  overTarget = false,
  className,
}: {
  /** 0-100, how much of the ring to fill. */
  ratio: number;
  /** Whole percent shown in the middle. */
  percent: number;
  tone: GoalTone;
  /** An expense goal past its cap. */
  overTarget?: boolean;
  className?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio)}
      aria-valuetext={`${Math.round(ratio)}%${overTarget ? ", over target" : ""}`}
      aria-label="Goal progress"
      className={cn("relative flex shrink-0 items-center justify-center rounded-full", TONE_STYLE[tone].ring, className)}
      style={{ width: SIZE, height: SIZE }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" aria-hidden>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-current/15" />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, ratio)) / 100)}
          className="transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
        />
      </svg>
      <span className={cn("absolute text-sm font-medium leading-none tabular", TONE_STYLE[tone].percent)}>{percent}%</span>
    </div>
  );
}
