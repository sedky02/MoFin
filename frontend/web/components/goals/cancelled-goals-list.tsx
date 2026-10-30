"use client";

import type { Account, Goal } from "@/lib/types";
import { GoalPanel } from "@/components/goals/goal-panel";
import { GoalRow } from "@/components/goals/goal-row";
import { groupCancelledGoals } from "@/lib/cancelled-goals";

/**
 * Cancelled goals, as a history: newest first, under the month they were cancelled in. Each row
 * shows where the goal stood when it was cancelled; its ring colour says whether it succeeded or failed.
 */
export function CancelledGoalsList({
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
  return (
    <div className="space-y-8">
      {groupCancelledGoals(goals).map((group) => (
        <GoalPanel key={group.key} id={`cancelled-${group.key}`} title={group.label}>
          {group.goals.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              account={accountsById.get(goal.accountId)}
              readOnly
              busy={busyId === goal.id}
              onRestore={onRestore}
              onViewHistory={onViewHistory}
            />
          ))}
        </GoalPanel>
      ))}
    </div>
  );
}
