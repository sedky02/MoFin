import { z } from 'zod';

export const exportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
});

export type ExportQueryDto = z.infer<typeof exportQuerySchema>;
export type ExportFormat = ExportQueryDto['format'];
