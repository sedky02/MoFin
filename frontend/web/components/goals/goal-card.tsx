"use client";

import { MoreVertical, Pencil, Ban, Repeat, History } from "lucide-react";
import type { Account, Goal } from "@/lib/types";
import { MoneyAmount } from "@/components/common/money-amount";
import { GoalTypeBadge, GoalStatusBadge } from "@/components/common/badges";
import { GoalProgressBar } from "@/components/goals/goal-progress-bar";
import { formatDate, goalProgressRatio } from "@/lib/format";
import { isGreaterThan } from "@/lib/decimal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function GoalCard({
  goal,
  account,
  onEdit,
  onStop,
  onViewHistory,
  readOnly = false,
}: {
  goal: Goal;
  account?: Account;
  onEdit?: (goal: Goal) => void;
  onStop?: (goal: Goal) => void;
  onViewHistory: (goal: Goal) => void;
  /** Disabled (stopped) goals are read-only — no Edit/Stop actions, just history. */
  readOnly?: boolean;
}) {
  const currency = account?.currency ?? "USD";
  const instance = goal.currentInstance;

  const ratio = instance ? goalProgressRatio(instance.progressAmount, instance.targetAmount) : 0;
  const overTarget =
    goal.type === "EXPENSE" && !!instance && isGreaterThan(instance.progressAmount, instance.targetAmount);

  const periodLabel = instance
    ? `${formatDate(instance.periodStart)} – ${formatDate(instance.periodEnd)}`
    : "No active period";

  return (
    <Card className="group relative border-0 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{goal.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <GoalTypeBadge type={goal.type} />
            {account && (
              <span className="text-xs text-muted-foreground tabular">
                {account.name} · {account.currency}
              </span>
            )}
            {goal.isRecurring && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Repeat className="size-3" />
                Every {goal.recurrenceUnit === "YEAR" ? "year" : "month"}
              </span>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label={`Actions for ${goal.name}`}
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onViewHistory(goal)}>
              <History className="size-4" />
              View history
            </DropdownMenuItem>
            {!readOnly && (
              <>
                <DropdownMenuItem onClick={() => onEdit?.(goal)}>
                  <Pencil className="size-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => onStop?.(goal)}>
                  <Ban className="size-4" />
                  Stop
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-5 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm">
            <MoneyAmount amount={instance?.progressAmount ?? "0"} currency={currency} className="font-semibold" />
            <span className="text-muted-foreground"> / </span>
            <MoneyAmount amount={goal.targetAmount} currency={currency} className="text-muted-foreground" />
          </span>
          {instance && <GoalStatusBadge status={instance.status} />}
        </div>
        <GoalProgressBar ratio={ratio} overTarget={overTarget} />
        <p className="text-xs text-muted-foreground">
          {readOnly && goal.archivedAt ? `Stopped on ${formatDate(goal.archivedAt)}` : periodLabel}
        </p>
      </div>
    </Card>
  );
}
