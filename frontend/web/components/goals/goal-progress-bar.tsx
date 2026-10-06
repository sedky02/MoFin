import { cn } from "@/lib/utils";

export function GoalProgressBar({
  ratio,
  overTarget = false,
  className,
}: {
  /** 0-100 */
  ratio: number;
  /** Styles the bar as over-target (EXPENSE goal that exceeded its cap). */
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
      className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
    >
      <div
        className={cn("h-full rounded-full transition-all", overTarget ? "bg-destructive" : "bg-primary")}
        style={{ width: `${ratio}%` }}
      />
    </div>
  );
}
