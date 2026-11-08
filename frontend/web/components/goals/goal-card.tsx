"use client";

import * as React from "react";
import { Ban, Check, History, MoreVertical, Pencil, RotateCcw, Wallet } from "lucide-react";
import type { Account, Goal } from "@/lib/types";
import { MoneyAmount } from "@/components/common/money-amount";
import { GoalProgressBar } from "@/components/goals/goal-progress-bar";
import { TONE_STYLE } from "@/components/goals/goal-ring";
import { goalPercent, goalProgressRatio } from "@/lib/format";
import { goalAttentionReason, goalPaceShare, goalPeriodBadge, goalTone, type GoalTone } from "@/lib/goal-standing";
import { goalAllCategoriesLabel, goalHeadline, goalTargetLine } from "@/lib/goal-scope";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type BadgeLook = "neutral" | "outline" | "danger" | "warning";

const BADGE_LOOK: Record<BadgeLook, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  outline: "text-muted-foreground ring-1 ring-inset ring-border",
  danger: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  // --warning on its own tint only just passes 4.5:1 in light mode, so the text goes a shade darker.
  warning: "bg-warning/10 text-amber-800 dark:bg-warning/20 dark:text-warning",
};

function GoalBadge({ look, children }: { look: BadgeLook; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        BADGE_LOOK[look],
      )}
    >
      {children}
    </span>
  );
}

const HEADLINE_COLOUR: Partial<Record<GoalTone, string>> = {
  failed: TONE_STYLE.failed.percent,
  behind: TONE_STYLE.behind.percent,
  achieved: TONE_STYLE.achieved.percent,
};

function GoalMenu({
  goal,
  readOnly,
  onEdit,
  onStop,
  onRestore,
  onViewHistory,
}: {
  goal: Goal;
  readOnly: boolean;
  onEdit?: (goal: Goal) => void;
  onStop?: (goal: Goal) => void;
  onRestore?: (goal: Goal) => void;
  onViewHistory: (goal: Goal) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground pointer-coarse:size-11"
          aria-label={`Actions for ${goal.name}`}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44 p-1.5 [&_[role=menuitem]]:gap-2.5 [&_[role=menuitem]]:px-2.5 [&_[role=menuitem]]:py-2 [&_[role=menuitem]]:whitespace-nowrap">
        <DropdownMenuItem onClick={() => onViewHistory(goal)}>
          <History className="size-4" />
          View history
        </DropdownMenuItem>
        {!readOnly && onEdit && (
          <>
            <DropdownMenuItem onClick={() => onEdit(goal)}>
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
  );
}

/**
 * One goal as a card. Left: what the goal is (name and badges); right: how it's doing (the big
 * figure, its target and the real amounts); the bar runs underneath. An achieved goal folds to one line.
 */
export function GoalCard({
  goal,
  account,
  showAccount = false,
  onEdit,
  onStop,
  onRestore,
  onViewHistory,
  readOnly = false,
  busy = false,
}: {
  goal: Goal;
  account?: Account;
  /** Name the account on Income/Expense goals too: on when every account is shown at once. */
  showAccount?: boolean;
  onEdit?: (goal: Goal) => void;
  onStop?: (goal: Goal) => void;
  onRestore?: (goal: Goal) => void;
  onViewHistory: (goal: Goal) => void;
  /** Cancelled goals are read-only: no Edit/Cancel actions, just history and Restore. */
  readOnly?: boolean;
  busy?: boolean;
}) {
  const currency = account?.currency ?? "USD";
  const instance = goal.currentInstance;
  const now = new Date();
  const tone = goalTone(goal, now);
  const headline = goalHeadline(goal);
  const reason = goal.archivedAt ? null : goalAttentionReason(goal, now);
  const periodBadge = goalPeriodBadge(goal, now);
  const progress = instance?.progressAmount ?? "0";
  const target = instance?.targetAmount ?? goal.targetAmount;
  const ratio = goalProgressRatio(progress, target);
  const pace = goalPaceShare(goal, now);
  const folded = tone === "achieved" && !goal.archivedAt;

  const badges = (
    <>
      {reason && <GoalBadge look={tone === "failed" ? "danger" : "warning"}>{reason}</GoalBadge>}
      {goal.type !== "BALANCE" && (
        <GoalBadge look="neutral">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", !goal.category?.color && "bg-muted-foreground/60")}
            style={goal.category?.color ? { backgroundColor: goal.category.color } : undefined}
          />
          <span className="truncate">{goal.category?.name ?? goalAllCategoriesLabel(goal.type)}</span>
        </GoalBadge>
      )}
      {account && (goal.type === "BALANCE" || showAccount) && (
        <GoalBadge look="neutral">
          <Wallet aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{account.name}</span>
        </GoalBadge>
      )}
      {periodBadge && <GoalBadge look="outline">{periodBadge}</GoalBadge>}
    </>
  );

  const figure = headline && (
    <span className={cn("tabular font-semibold", HEADLINE_COLOUR[tone])}>
      <MoneyAmount amount={headline.amount} currency={currency} /> {headline.label}
    </span>
  );

  const amounts = (
    <span className="tabular text-xs text-muted-foreground" data-testid="goal-amounts">
      <MoneyAmount amount={progress} currency={currency} className="font-medium text-foreground" />
      {" / "}
      <MoneyAmount amount={target} currency={currency} />
    </span>
  );

  const menu = (
    <GoalMenu
      goal={goal}
      readOnly={readOnly}
      onEdit={onEdit}
      onStop={onStop}
      onRestore={onRestore}
      onViewHistory={onViewHistory}
    />
  );

  if (folded) {
    return (
      <li
        aria-busy={busy || undefined}
        data-tone={tone}
        className="flex items-center gap-x-3 gap-y-2 rounded-card bg-card px-5 py-4 shadow-surface max-sm:flex-wrap sm:px-6"
      >
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
        >
          <Check className="size-4" strokeWidth={2.5} />
        </span>
        <h3 className="min-w-0 truncate text-base font-medium">{goal.name}</h3>
        <div className="flex min-w-0 flex-wrap gap-2 max-sm:order-last max-sm:basis-full max-sm:pl-10">{badges}</div>
        <div className="ml-auto flex shrink-0 flex-col items-end text-right">
          <span className="text-base">{figure}</span>
          {amounts}
        </div>
        <div className="-mr-2 shrink-0">{menu}</div>
      </li>
    );
  }

  return (
    <li
      aria-busy={busy || undefined}
      data-tone={tone}
      className={cn(
        "rounded-card bg-card p-5 shadow-surface transition-opacity sm:p-6",
        (busy || goal.archivedAt) && "opacity-70",
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <h3 className="col-start-1 row-start-1 truncate pt-0.5 text-base font-medium">{goal.name}</h3>

        <div className="col-start-2 row-start-1 -mt-1 -mr-2 sm:col-start-3 sm:row-span-2">{menu}</div>

        <div className="col-span-2 row-start-2 flex flex-col sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:items-end sm:text-right">
          <span className="text-2xl tracking-tight">{figure}</span>
          <span className="mt-0.5 text-[13px] text-muted-foreground">{goalTargetLine(goal, currency)}</span>
          <span className="mt-1">{amounts}</span>
        </div>

        <div className="col-span-2 row-start-3 flex flex-wrap gap-2 sm:col-span-1 sm:col-start-1 sm:row-start-2">
          {badges}
        </div>
      </div>

      <GoalProgressBar
        className="mt-5 sm:mt-6"
        ratio={ratio}
        tone={tone}
        valueText={`${goalPercent(progress, target)}% of the target${
          pace != null ? `, ${Math.round(pace * 100)}% of the period gone` : ""
        }`}
      />
    </li>
  );
}
