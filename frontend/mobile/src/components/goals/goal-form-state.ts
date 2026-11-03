// Validation for the goal form: the web goal-dialog's zod schema and messages, unchanged.
import { z } from 'zod';

import { parseMoneyInput } from '@/core/format';
import type { Goal, GoalRecurrenceUnit, GoalType } from '@/core/types';
import type { CreateGoalInput } from '@/hooks/useGoals';

const schema = z
  .object({
    accountId: z.string().min(1, 'Select an account.'),
    name: z.string().trim().min(1, 'Name is required.').max(60),
    type: z.enum(['BALANCE', 'INCOME', 'EXPENSE']),
    targetAmount: z.string().refine((v) => !!parseMoneyInput(v), 'Enter a valid amount.'),
    isRecurring: z.boolean(),
    recurrenceUnit: z.enum(['MONTH', 'YEAR']).optional(),
    periodStart: z.string().min(1, 'Start date is required.'),
    periodEnd: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.isRecurring && !value.recurrenceUnit) {
      ctx.addIssue({ code: 'custom', path: ['recurrenceUnit'], message: 'Pick how often this goal repeats.' });
    }
    if (!value.isRecurring && !value.periodEnd) {
      ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: 'End date is required for a fixed goal.' });
    }
    // The end date counts in full, so a one-day goal (start = end) is fine.
    if (!value.isRecurring && value.periodEnd && value.periodEnd < value.periodStart) {
      ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: "End date can't be before the start date." });
    }
  });

export type GoalDraft = {
  accountId: string;
  name: string;
  type: GoalType;
  targetAmount: string;
  isRecurring: boolean;
  recurrenceUnit?: GoalRecurrenceUnit;
  periodStart: string;
  periodEnd: string;
};

export type GoalErrors = Partial<Record<keyof GoalDraft, string>>;

export function initialGoalDraft(goal: Goal | undefined, activeAccountId: string | undefined, today: string): GoalDraft {
  if (goal) {
    return {
      accountId: goal.accountId,
      name: goal.name,
      type: goal.type,
      targetAmount: goal.targetAmount,
      isRecurring: goal.isRecurring,
      recurrenceUnit: goal.recurrenceUnit ?? undefined,
      periodStart: goal.periodStart.slice(0, 10),
      periodEnd: goal.periodEnd?.slice(0, 10) ?? '',
    };
  }
  return {
    accountId: activeAccountId ?? '',
    name: '',
    type: 'BALANCE',
    targetAmount: '',
    isRecurring: false,
    recurrenceUnit: undefined,
    periodStart: today,
    periodEnd: '',
  };
}

export function validateGoalDraft(draft: GoalDraft): { ok: true; input: CreateGoalInput } | { ok: false; errors: GoalErrors } {
  const result = schema.safeParse(draft);
  if (!result.success) {
    const errors: GoalErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof GoalDraft;
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const v = result.data;
  return {
    ok: true,
    input: {
      accountId: v.accountId,
      name: v.name,
      type: v.type,
      // The parsed decimal, not the typed text (a submit can land before the field's blur tidy).
      targetAmount: parseMoneyInput(v.targetAmount) ?? v.targetAmount,
      isRecurring: v.isRecurring,
      recurrenceUnit: v.isRecurring ? v.recurrenceUnit : undefined,
      periodStart: v.periodStart,
      periodEnd: v.isRecurring ? undefined : v.periodEnd,
    },
  };
}
