import { z } from 'zod';

/**
 * Shared offset-pagination query fields. Coerced from query strings and bounded
 * so a caller cannot request an unbounded result set (audit B2).
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type Pagination = z.infer<typeof paginationSchema>;
