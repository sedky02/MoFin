"use client";

import { MoreVertical, Pencil, Ban, Repeat, History, RotateCcw } from "lucide-react";
import type { Account, Goal } from "@/lib/types";
import { MoneyAmount } from "@/components/common/money-amount";
import { GoalTypeBadge, GoalStatusBadge } from "@/components/common/badges";
import { GoalProgressBar } from "@/components/goals/goal-progress-bar";
import { goalPercent, goalProgressRatio } from "@/lib/format";
import { isGreaterThan } from "@/lib/decimal";
import { goalScopeLabel } from "@/lib/goal-scope";
import { cn } from "@/lib/utils";
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
  onRestore,
  onViewHistory,
  readOnly = false,
}: {
  goal: Goal;
  account?: Account;
  onEdit?: (goal: Goal) => void;
  onStop?: (goal: Goal) => void;
  onRestore?: (goal: Goal) => void;
  onViewHistory: (goal: Goal) => void;
  /** Ended goals are read-only — no Edit/End actions, just history and Restore. */
  readOnly?: boolean;
}) {
  const currency = account?.currency ?? "USD";
  const instance = goal.currentInstance;

  const ratio = instance ? goalProgressRatio(instance.progressAmount, instance.targetAmount) : 0;
  const percent = instance ? goalPercent(instance.progressAmount, instance.targetAmount) : 0;
  const overTarget =
    goal.type === "EXPENSE" && !!instance && isGreaterThan(instance.progressAmount, instance.targetAmount);

  return (
    <Card className="group relative h-full gap-0 border-0 p-4 shadow-sm">
      {/* Top line: what kind of goal and how often, then its status and menu. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <GoalTypeBadge type={goal.type} />
          {goal.isRecurring && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Repeat className="size-3" aria-hidden />
              Every {goal.recurrenceUnit === "YEAR" ? "year" : "month"}
            </span>
          )}
        </div>
        <div className="-mr-1.5 flex shrink-0 items-center gap-1">
          {/* An ended goal's open period was frozen unjudged; "In progress" would be wrong there. */}
          {instance && !(goal.archivedAt && instance.status === "IN_PROGRESS") && (
            <GoalStatusBadge status={instance.status} />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
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
                    End goal
                  </DropdownMenuItem>
                </>
              )}
              {readOnly && onRestore && (
                <DropdownMenuItem onClick={() => onRestore(goal)}>
                  <RotateCcw className="size-4" />
                  Restore
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <h3 className="mt-2.5 truncate text-sm font-medium">{goal.name}</h3>

      {/* The figure that matters, with its target beside it and the share reached at the end. */}
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <p className="flex min-w-0 items-baseline gap-1.5">
          <MoneyAmount
            amount={instance?.progressAmount ?? "0"}
            currency={currency}
            className={cn("truncate text-xl font-semibold leading-tight", overTarget && "text-destructive")}
          />
          <span className="shrink-0 text-sm text-muted-foreground">
            of <MoneyAmount amount={goal.targetAmount} currency={currency} />
          </span>
        </p>
        <span
          className={cn("shrink-0 text-sm font-medium tabular", overTarget ? "text-destructive" : "text-muted-foreground")}
        >
          {percent}%
        </span>
      </div>

      <GoalProgressBar ratio={ratio} overTarget={overTarget} className="mt-3 h-1.5" />

      {/* What the goal counts, kept for screen readers: the card itself stays quiet. */}
      <p className="sr-only" data-testid="goal-scope">
        {goalScopeLabel(goal.type, account?.name)}
      </p>
    </Card>
  );
}
