import { timeZoneSchema } from '../../../common/utils/time-zone';
import { z } from 'zod';

// Plain object (no refinement) so MCP can expose its raw shape as a tool inputSchema.
export const monthlySummaryQueryObject = z.object({
  year: z.coerce.number().int().min(2000),
  month: z.coerce.number().int().min(1).max(12),
  refresh: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === 'true'),
  accountId: z.string().optional(),
  // Amounts can't be summed across currencies: an all-accounts summary is always one currency.
  currency: z.string().length(3).optional(),
});
export const monthlySummaryQuerySchema = monthlySummaryQueryObject.superRefine(
  (value, ctx) => {
    if (!value.accountId && !value.currency) {
      ctx.addIssue({
        code: 'custom',
        path: ['currency'],
        message: 'currency is required when accountId is not given',
      });
    }
  },
);
export const monthlySeriesQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
  // Balances can't be summed across currencies, so the series is always one currency.
  currency: z.string().length(3),
  accountId: z.string().optional(),
});
export type MonthlySeriesQueryDto = z.infer<typeof monthlySeriesQuerySchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
  }, 'not a calendar date');

export const dailySeriesQuerySchema = z.object({
  /** First day, in the caller's time zone (the app sends the Monday of a week). */
  from: isoDate,
  days: z.coerce.number().int().min(1).max(62).default(7),
  // Balances can't be summed across currencies, so the series is always one currency.
  currency: z.string().length(3),
  accountId: z.string().optional(),
  /** Which calendar the days follow; a transaction at 00:30 in Tunis belongs to that day, not the UTC one. */
  tz: timeZoneSchema.default('UTC'),
});
export type DailySeriesQueryDto = z.infer<typeof dailySeriesQuerySchema>;

export type MonthlySummaryQueryDto = z.infer<typeof monthlySummaryQuerySchema>;
