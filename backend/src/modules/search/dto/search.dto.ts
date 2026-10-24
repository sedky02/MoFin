import { z } from 'zod';
import { amountStringSchema, dateStringSchema } from '../../../common/dto/common-fields';
import { paginationSchema } from '../../../common/dto/pagination';

export const searchTransactionsSchema = paginationSchema.extend({
  q: z.string().min(1).optional(),
  categoryId: z.string().optional(),
  accountId: z.string().optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  minAmount: amountStringSchema.optional(),
  maxAmount: amountStringSchema.optional(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
  // Leave it out for both. A recurring transaction is a series root or one of the occurrences it generated;
  // `series` is the roots alone, one row per recurring series.
  recurrence: z.enum(['recurring', 'one-off', 'series']).optional(),
  // Amount sorts compare the transaction total as stored, across currencies.
  // `next-occurrence` puts active series first, soonest next date first; anything else follows, newest first.
  sort: z.enum(['newest', 'oldest', 'amount-desc', 'amount-asc', 'next-occurrence']).optional(),
});
export type SearchTransactionsDto = z.infer<typeof searchTransactionsSchema>;
