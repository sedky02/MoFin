import { z } from 'zod';

/** Bounded so a caller can't request an unbounded result set. */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type Pagination = z.infer<typeof paginationSchema>;

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}
