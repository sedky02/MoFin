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
export const monthlySummaryQuerySchema = monthlySummaryQueryObject.superRefine((value, ctx) => {
  if (!value.accountId && !value.currency) {
    ctx.addIssue({
      code: 'custom',
      path: ['currency'],
      message: 'currency is required when accountId is not given',
    });
  }
});
export const monthlySeriesQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
  // Balances can't be summed across currencies, so the series is always one currency.
  currency: z.string().length(3),
  accountId: z.string().optional(),
});
export type MonthlySeriesQueryDto = z.infer<typeof monthlySeriesQuerySchema>;

export type MonthlySummaryQueryDto = z.infer<typeof monthlySummaryQuerySchema>;
