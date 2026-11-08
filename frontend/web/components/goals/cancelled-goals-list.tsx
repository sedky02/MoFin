"use client";

import { canPost } from "@/lib/account-sharing";
import type { Account, Goal } from "@/lib/types";
import { GoalCard } from "@/components/goals/goal-card";
import { groupCancelledGoals } from "@/lib/cancelled-goals";

/**
 * Cancelled goals, as a history: newest first, under the month they were cancelled in. Each row
 * shows where the goal stood when it was cancelled; its bar colour says whether it succeeded or failed.
 */
export function CancelledGoalsList({
  goals,
  accountsById,
  showAccount = false,
  onRestore,
  onViewHistory,
  busyId,
}: {
  goals: Goal[];
  accountsById: Map<string, Account>;
  showAccount?: boolean;
  onRestore: (goal: Goal) => void;
  onViewHistory: (goal: Goal) => void;
  /** Id of the goal a restore is in flight for. */
  busyId?: string;
}) {
  return (
    <div className="space-y-10">
      {groupCancelledGoals(goals).map((group) => (
        <section key={group.key} aria-labelledby={`cancelled-${group.key}`}>
          <h2 id={`cancelled-${group.key}`} className="mb-3 px-1 text-[13px] font-semibold text-muted-foreground">
            {group.label}
          </h2>
          <ul className="space-y-3">
            {group.goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                account={accountsById.get(goal.accountId)}
                showAccount={showAccount}
                readOnly
                busy={busyId === goal.id}
                onRestore={canPost(accountsById.get(goal.accountId)) ? onRestore : undefined}
                onViewHistory={onViewHistory}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
