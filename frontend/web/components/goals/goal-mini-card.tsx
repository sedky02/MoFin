import type { Account, Goal } from "@/lib/types";
import { MoneyAmount } from "@/components/common/money-amount";
import { GoalTypeBadge, GoalStatusBadge } from "@/components/common/badges";
import { GoalProgressBar } from "@/components/goals/goal-progress-bar";
import { goalProgressRatio } from "@/lib/format";
import { isGreaterThan } from "@/lib/decimal";

/** Read-only compact goal card for the dashboard — no edit/archive actions. */
export function GoalMiniCard({ goal, account }: { goal: Goal; account?: Account }) {
  const currency = account?.currency ?? "USD";
  const instance = goal.currentInstance;

  const ratio = instance ? goalProgressRatio(instance.progressAmount, instance.targetAmount) : 0;
  const overTarget =
    goal.type === "EXPENSE" && !!instance && isGreaterThan(instance.progressAmount, instance.targetAmount);

  return (
    <div className="rounded-lg border border-border/70 bg-card/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{goal.name}</h3>
          <div className="mt-1 flex items-center gap-2">
            <GoalTypeBadge type={goal.type} />
            {account && <span className="text-xs text-muted-foreground tabular">{account.name}</span>}
          </div>
        </div>
        {instance && <GoalStatusBadge status={instance.status} />}
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-baseline gap-1 text-sm">
          <MoneyAmount amount={instance?.progressAmount ?? "0"} currency={currency} className="font-semibold" />
          <span className="text-muted-foreground">/</span>
          <MoneyAmount amount={goal.targetAmount} currency={currency} className="text-muted-foreground" />
        </div>
        <GoalProgressBar ratio={ratio} overTarget={overTarget} />
      </div>
    </div>
  );
}
