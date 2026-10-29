"use client";

import { History, RotateCcw } from "lucide-react";
import type { Account, Goal } from "@/lib/types";
import { MoneyAmount } from "@/components/common/money-amount";
import { GoalTypeBadge, GoalStatusBadge } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, goalPercent } from "@/lib/format";
import { groupEndedGoals } from "@/lib/ended-goals";

/**
 * Goals that were ended, as a history: newest first, under the month they were ended in. Each row
 * shows where the goal stood when it was ended, and offers its history and a way to restore it.
 */
export function EndedGoalsList({
  goals,
  accountsById,
  onRestore,
  onViewHistory,
  busyId,
}: {
  goals: Goal[];
  accountsById: Map<string, Account>;
  onRestore: (goal: Goal) => void;
  onViewHistory: (goal: Goal) => void;
  /** Id of the goal a restore is in flight for. */
  busyId?: string;
}) {
  const groups = groupEndedGoals(goals);

  return (
    <div className="max-w-3xl space-y-6">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`ended-${group.key}`}>
          <h2 id={`ended-${group.key}`} className="mb-2 px-1 text-sm font-semibold text-muted-foreground">
            {group.label}
          </h2>
          <Card className="gap-0 border-0 py-0 shadow-sm">
            <ul className="divide-y divide-border">
              {group.goals.map((goal) => {
                const instance = goal.currentInstance;
                const currency = accountsById.get(goal.accountId)?.currency ?? "USD";
                const busy = busyId === goal.id;
                // An ended goal's open period was frozen unjudged, so "In progress" would be wrong here.
                const showStatus = !!instance && instance.status !== "IN_PROGRESS";
                return (
                  <li
                    key={goal.id}
                    aria-busy={busy || undefined}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-opacity ${busy ? "opacity-60" : ""}`}
                  >
                    <div className="min-w-0 flex-1 basis-48">
                      <h3 className="truncate text-sm font-medium">{goal.name}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <GoalTypeBadge type={goal.type} />
                        <span className="text-xs text-muted-foreground">Ended {formatDate(goal.archivedAt!)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <p className="text-right text-sm">
                        <MoneyAmount
                          amount={instance?.progressAmount ?? "0"}
                          currency={currency}
                          className="font-semibold"
                        />
                        <span className="text-muted-foreground">
                          {" "}
                          of <MoneyAmount amount={goal.targetAmount} currency={currency} />
                        </span>
                        {instance && (
                          <span className="ml-2 tabular text-xs text-muted-foreground">
                            {goalPercent(instance.progressAmount, instance.targetAmount)}%
                          </span>
                        )}
                      </p>
                      {/* A fixed slot, so the amounts line up between rows with and without a status. */}
                      <div className="flex sm:w-[4.75rem] sm:justify-end">
                        {showStatus && <GoalStatusBadge status={instance.status} />}
                      </div>
                    </div>

                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground"
                        onClick={() => onViewHistory(goal)}
                        aria-label={`View history of ${goal.name}`}
                        title="View history"
                      >
                        <History className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={busy}
                        onClick={() => onRestore(goal)}
                        aria-label={`Restore ${goal.name}`}
                      >
                        <RotateCcw className="size-3.5" aria-hidden />
                        Restore
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}
