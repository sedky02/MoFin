import { GoalRecurrenceUnit, GoalType } from '@prisma/client';
import { z } from 'zod';
import { amountStringSchema, dateStringSchema } from '../../../common/dto/common-fields';

const baseGoalSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1),
  type: z.nativeEnum(GoalType),
  targetAmount: amountStringSchema,
  isRecurring: z.boolean().default(false),
  recurrenceUnit: z.nativeEnum(GoalRecurrenceUnit).optional(),
  periodStart: dateStringSchema,
  periodEnd: dateStringSchema.optional(),
});

export const createGoalSchema = baseGoalSchema.superRefine((value, ctx) => {
  if (value.isRecurring && !value.recurrenceUnit) {
    ctx.addIssue({
      code: 'custom',
      path: ['recurrenceUnit'],
      message: 'recurrenceUnit is required when isRecurring is true',
    });
  }
  if (!value.isRecurring && !value.periodEnd) {
    ctx.addIssue({
      code: 'custom',
      path: ['periodEnd'],
      message: 'periodEnd is required for a fixed (non-recurring) goal',
    });
  }
  if (!value.isRecurring && value.recurrenceUnit) {
    ctx.addIssue({
      code: 'custom',
      path: ['recurrenceUnit'],
      message: 'recurrenceUnit must not be set when isRecurring is false',
    });
  }
  if (value.periodEnd && Date.parse(value.periodEnd) <= Date.parse(value.periodStart)) {
    ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: 'periodEnd must be after periodStart' });
  }
});
export type CreateGoalDto = z.infer<typeof baseGoalSchema>;

export const updateGoalSchema = z.object({
  name: z.string().min(1).optional(),
  targetAmount: amountStringSchema.optional(),
});
export type UpdateGoalDto = z.infer<typeof updateGoalSchema>;

export const listGoalsQuerySchema = z.object({
  status: z.enum(['active', 'archived', 'all']).default('active'),
});
export type ListGoalsQueryDto = z.infer<typeof listGoalsQuerySchema>;
