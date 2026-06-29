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
});
export type SearchTransactionsDto = z.infer<typeof searchTransactionsSchema>;
