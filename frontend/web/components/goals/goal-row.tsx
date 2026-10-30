"use client";

import { MoreVertical, Pencil, Ban, History, RotateCcw } from "lucide-react";
import type { Account, Goal } from "@/lib/types";
import { MoneyAmount } from "@/components/common/money-amount";
import { COLOURED_AMOUNT, GoalRing, TONE_STYLE } from "@/components/goals/goal-ring";
import { formatDate, goalPercent, goalProgressRatio } from "@/lib/format";
import { goalRepeatLabel, goalTimeLeft, goalTone, isOverLimit } from "@/lib/goal-standing";
import { goalScopeLabel } from "@/lib/goal-scope";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TYPE_LABEL = { BALANCE: "Balance", INCOME: "Income", EXPENSE: "Expense" } as const;

/**
 * One goal as a row in a group's panel: progress ring, name and details, amounts, and a menu that
 * shows on hover. The group heading names the status, so the row carries none of its own.
 */
export function GoalRow({
  goal,
  account,
  onEdit,
  onStop,
  onRestore,
  onViewHistory,
  readOnly = false,
  busy = false,
}: {
  goal: Goal;
  account?: Account;
  onEdit?: (goal: Goal) => void;
  onStop?: (goal: Goal) => void;
  onRestore?: (goal: Goal) => void;
  onViewHistory: (goal: Goal) => void;
  /** Cancelled goals are read-only — no Edit/Cancel actions, just history and Restore. */
  readOnly?: boolean;
  busy?: boolean;
}) {
  const currency = account?.currency ?? "USD";
  const instance = goal.currentInstance;
  const now = new Date();

  const ratio = instance ? goalProgressRatio(instance.progressAmount, instance.targetAmount) : 0;
  // The ring tops out at 100%, even for a goal that went past its target.
  const percent = instance ? Math.min(100, goalPercent(instance.progressAmount, instance.targetAmount)) : 0;
  const overTarget = isOverLimit(goal);
  const tone = goalTone(goal, now);

  const details = [
    TYPE_LABEL[goal.type],
    account?.name,
    goalRepeatLabel(goal),
    goal.archivedAt ? `Cancelled ${formatDate(goal.archivedAt)}` : goalTimeLeft(goal, now),
  ].filter(Boolean);

  return (
    <li
      aria-busy={busy || undefined}
      data-tone={tone}
      className={cn(
        "group/row flex items-center gap-x-4 gap-y-2 px-5 py-5 transition-[opacity,background-color] max-sm:flex-wrap hover:bg-muted/40",
        busy && "opacity-60",
      )}
    >
      <GoalRing ratio={ratio} percent={percent} tone={tone} overTarget={overTarget} />

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-medium">{goal.name}</h3>
        <p className="mt-1 truncate text-sm text-muted-foreground" title={details.join(" · ")}>
          {details.join(" · ")}
        </p>
      </div>

      <p className="shrink-0 text-right text-base max-sm:order-last max-sm:basis-full max-sm:pl-19 max-sm:text-left">
        <MoneyAmount
          amount={instance?.progressAmount ?? "0"}
          currency={currency}
          className={cn("font-semibold", COLOURED_AMOUNT.includes(tone) && TONE_STYLE[tone].percent)}
        />
        <span className="text-muted-foreground">
          {" / "}
          <MoneyAmount amount={goal.targetAmount} currency={currency} />
        </span>
      </p>

      {/* Quiet until you point at the row or move focus into it; touch screens have no hover. */}
      <div className="-mr-1.5 shrink-0 max-sm:ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground transition-opacity sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100 sm:data-[state=open]:opacity-100 pointer-coarse:opacity-100"
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
                  Cancel goal
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

      {/* What the goal counts, kept for screen readers: the row itself stays quiet. */}
      <p className="sr-only" data-testid="goal-scope">
        {goalScopeLabel(goal.type, account?.name)}
      </p>
    </li>
  );
}
