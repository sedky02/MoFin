import type { Account, Goal } from "@/lib/types";
import { MoneyAmount } from "@/components/common/money-amount";
import { GoalProgressBar } from "@/components/goals/goal-progress-bar";
import { CategoryIcon } from "@/components/dashboard/category-icon";
import { goalProgressRatio } from "@/lib/format";
import { isGreaterThan, tryParse } from "@/lib/decimal";

// Cycled per-tile accent, matching the Stitch mockup's alternating
// secondary/tertiary/primary goal icon tints.
// (`--secondary` is a near-black surface colour in dark mode, so it can't be an icon colour.)
const ACCENTS = ["var(--chart-2)", "var(--success)", "var(--primary)"];

/** Read-only compact goal card for the dashboard — no edit/archive actions. */
export function GoalMiniCard({
  goal,
  account,
  index = 0,
}: {
  goal: Goal;
  account?: Account;
  index?: number;
}) {
  const currency = account?.currency ?? "USD";
  const instance = goal.currentInstance;

  const ratio = instance ? goalProgressRatio(instance.progressAmount, instance.targetAmount) : 0;
  const overTarget =
    goal.type === "EXPENSE" && !!instance && isGreaterThan(instance.progressAmount, instance.targetAmount);
  const belowZero = !!instance && (tryParse(instance.progressAmount)?.isNegative() ?? false);
  const accent = ACCENTS[index % ACCENTS.length];

  return (
    <div className="rounded-2xl border border-border/70 bg-card/40 p-4 transition-colors hover:border-primary/30">
      <div className="mb-2 flex items-center justify-between">
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
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium tabular">
          {overTarget && <span className="text-destructive">Over budget</span>}
          <span className="text-muted-foreground">{belowZero ? "Below zero" : `${Math.round(ratio)}%`}</span>
        </span>
      </div>

      <GoalProgressBar ratio={ratio} overTarget={overTarget} />

      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular">
        <MoneyAmount amount={instance?.progressAmount ?? "0"} currency={currency} />
        <MoneyAmount amount={goal.targetAmount} currency={currency} />
      </div>
    </div>
  );
}
