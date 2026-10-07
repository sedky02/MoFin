import { z } from 'zod';

export const monthlySummaryQuerySchema = z.object({
  year: z.coerce.number().int().min(2000),
  month: z.coerce.number().int().min(1).max(12),
  refresh: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === 'true'),
  accountId: z.string().optional(),
  // Amounts can't be summed across currencies: restrict an all-accounts summary to one.
  currency: z.string().length(3).optional(),
});
export const monthlySeriesQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
  // Balances can't be summed across currencies, so the series is always one currency.
  currency: z.string().length(3),
  accountId: z.string().optional(),
});
export type MonthlySeriesQueryDto = z.infer<typeof monthlySeriesQuerySchema>;

export type MonthlySummaryQueryDto = z.infer<typeof monthlySummaryQuerySchema>;
