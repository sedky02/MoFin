import { z } from 'zod';

export const monthlySummaryQuerySchema = z.object({
  year: z.coerce.number().int().min(2000),
  month: z.coerce.number().int().min(1).max(12),
  refresh: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === 'true'),
});
export type MonthlySummaryQueryDto = z.infer<typeof monthlySummaryQuerySchema>;
