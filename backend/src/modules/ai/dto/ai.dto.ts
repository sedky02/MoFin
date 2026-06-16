import { z } from 'zod';
import { currencySchema } from '../../../common/dto/common-fields';

export const parseTransactionIntentSchema = z.object({
  input: z.string().min(1),
  defaultAccountId: z.string().optional(),
  defaultCurrency: currencySchema.optional(),
});
export type ParseTransactionIntentDto = z.infer<typeof parseTransactionIntentSchema>;
