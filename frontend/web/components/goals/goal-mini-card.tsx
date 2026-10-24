import type { Account, Goal } from "@/lib/types";
import { MoneyAmount } from "@/components/common/money-amount";
import { GoalProgressBar } from "@/components/goals/goal-progress-bar";
import { CategoryIcon } from "@/components/dashboard/category-icon";
import { goalProgressRatio } from "@/lib/format";
import { isGreaterThan, tryParse } from "@/lib/decimal";

/**
 * Compact, read-only goal tile for the dashboard. Its colour says where the goal stands
 * (over budget, reached, in progress), not which slot of the list it occupies.
 */
export function GoalMiniCard({ goal, account }: { goal: Goal; account?: Account }) {
  const currency = account?.currency ?? "USD";
  const instance = goal.currentInstance;

  const ratio = instance ? goalProgressRatio(instance.progressAmount, instance.targetAmount) : 0;
  const overTarget =
    goal.type === "EXPENSE" && !!instance && isGreaterThan(instance.progressAmount, instance.targetAmount);
  const belowZero = !!instance && (tryParse(instance.progressAmount)?.isNegative() ?? false);
  const accent = overTarget ? "var(--destructive)" : ratio >= 100 ? "var(--success)" : "var(--primary)";

  return (
    <div className="rounded-xl bg-muted p-4 transition-colors hover:bg-accent">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundColor: `color-mix(in oklab, ${accent} 16%, transparent)`,
              color: accent,
            }}
          >
            <CategoryIcon name={goal.name} className="size-4" />
          </div>
          <span className="truncate text-sm font-semibold">{goal.name}</span>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium tabular">
          {overTarget ? (
            <span className="text-destructive">Over budget</span>
          ) : (
            <span className="text-muted-foreground">{belowZero ? "Below zero" : `${Math.round(ratio)}%`}</span>
          )}
        </span>
      </div>

      <GoalProgressBar ratio={ratio} overTarget={overTarget} />

      <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular">
        <MoneyAmount amount={instance?.progressAmount ?? "0"} currency={currency} />
        <MoneyAmount amount={goal.targetAmount} currency={currency} />
      </div>
    </div>
  );
}
