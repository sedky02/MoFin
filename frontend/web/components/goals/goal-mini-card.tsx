import type { Account, Goal } from "@/lib/types";
import { MoneyAmount } from "@/components/common/money-amount";
import { GoalRing } from "@/components/goals/goal-ring";
import { goalPercent, goalProgressRatio } from "@/lib/format";
import { goalTone, isOverLimit } from "@/lib/goal-standing";
import { tryParse } from "@/lib/decimal";

/**
 * Compact, read-only goal tile for the dashboard. It shows the same progress ring as the Goals
 * page, coloured by where the goal stands (over budget, behind, on track, reached).
 */
export function GoalMiniCard({ goal, account }: { goal: Goal; account?: Account }) {
  const currency = account?.currency ?? "USD";
  const instance = goal.currentInstance;

  const ratio = instance ? goalProgressRatio(instance.progressAmount, instance.targetAmount) : 0;
  const percent = instance ? Math.min(100, goalPercent(instance.progressAmount, instance.targetAmount)) : 0;
  const overTarget = isOverLimit(goal);
  const belowZero = !!instance && (tryParse(instance.progressAmount)?.isNegative() ?? false);
  const tone = goalTone(goal);

  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/35 p-4 transition-colors hover:bg-muted/70 dark:bg-muted dark:hover:bg-accent">
      <GoalRing ratio={ratio} percent={percent} tone={tone} overTarget={overTarget} size={48} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold">{goal.name}</span>
          {overTarget ? (
            <span className="shrink-0 text-xs font-medium text-destructive">Over budget</span>
          ) : (
            belowZero && <span className="shrink-0 text-xs font-medium text-muted-foreground">Below zero</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground tabular">
          <MoneyAmount amount={instance?.progressAmount ?? "0"} currency={currency} className="font-medium text-foreground" />
          {" / "}
          <MoneyAmount amount={goal.targetAmount} currency={currency} />
        </p>
      </div>
    </div>
  );
}
