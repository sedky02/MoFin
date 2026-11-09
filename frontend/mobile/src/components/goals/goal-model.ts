// Pure display model for a goal row, built from the copied web helpers (goal-standing, goal-scope,
// format). The row component only renders what this returns.
import { formatDate, goalPercent, goalProgressRatio } from '@/core/format';
import { goalAllCategoriesLabel, goalHeadline, goalScopeLabel, goalTargetLine, type GoalHeadline } from '@/core/goal-scope';
import { goalAttentionReason, goalPeriodBadge, goalTimeLeft, goalTone, isOverLimit, type GoalTone } from '@/core/goal-standing';
import type { Account, Goal, GoalType } from '@/core/types';

export const TYPE_LABEL: Record<GoalType, string> = { BALANCE: 'Balance', INCOME: 'Income', EXPENSE: 'Expense' };

export const COLOURED_AMOUNT: GoalTone[] = ['failed', 'behind', 'achieved'];

export type GoalRowModel = {
  currency: string;
  ratio: number;
  percent: number;
  tone: GoalTone;
  overTarget: boolean;
  progressAmount: string;
  targetAmount: string;
  details: string;
  scope: string;
  /** The card's big figure: what is left or over, still to go or above. */
  headline: GoalHeadline | null;
  /** The line under it: "of your $300 monthly limit". */
  targetLine: string;
  /** Why it needs attention ("Over limit", "Spending fast"…), coloured; null otherwise. */
  reason: string | null;
  /** What it counts: the category (or "All spending"), null for a Balance goal. */
  category: { name: string; color: string | null } | null;
  /** "Resets in 23 days", "Until Dec 31", "Cancelled Oct 12, 2026". */
  period: string | null;
  /** An achieved, still-active goal folds to one line. */
  folded: boolean;
};

export function goalRowModel(goal: Goal, account: Account | undefined, now: Date = new Date()): GoalRowModel {
  const instance = goal.currentInstance;
  const details = [
    TYPE_LABEL[goal.type],
    account?.name,
    goal.isRecurring ? (goal.recurrenceUnit === 'YEAR' ? 'Yearly' : 'Monthly') : null,
    goal.archivedAt ? `Cancelled ${formatDate(goal.archivedAt)}` : goalTimeLeft(goal, now),
  ].filter(Boolean);
  return {
    currency: account?.currency ?? 'USD',
    ratio: instance ? goalProgressRatio(instance.progressAmount, instance.targetAmount) : 0,
    percent: instance ? Math.min(100, goalPercent(instance.progressAmount, instance.targetAmount)) : 0,
    tone: goalTone(goal, now),
    overTarget: isOverLimit(goal),
    progressAmount: instance?.progressAmount ?? '0',
    targetAmount: goal.targetAmount,
    details: details.join(' · '),
    scope: goalScopeLabel(goal.type, account?.name),
    headline: goalHeadline(goal),
    targetLine: goalTargetLine(goal, account?.currency ?? 'USD'),
    reason: goal.archivedAt ? null : goalAttentionReason(goal, now),
    category:
      goal.type === 'BALANCE'
        ? null
        : { name: goal.category?.name ?? goalAllCategoriesLabel(goal.type), color: goal.category?.color ?? null },
    period: goalPeriodBadge(goal, now),
    folded: goalTone(goal, now) === 'achieved' && !goal.archivedAt,
  };
}
