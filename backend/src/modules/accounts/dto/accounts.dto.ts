import { AccountType } from '@prisma/client';
import { z } from 'zod';
import {
  currencySchema,
  signedAmountStringSchema,
} from '../../../common/dto/common-fields';
import { paginationSchema } from '../../../common/dto/pagination';

export const createAccountSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(AccountType),
  currency: currencySchema,
  // In the account's currency. Added to its balance; never a transaction.
  openingBalance: signedAmountStringSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateAccountDto = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.nativeEnum(AccountType).optional(),
  openingBalance: signedAmountStringSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type UpdateAccountDto = z.infer<typeof updateAccountSchema>;

export const listAccountsQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'archived', 'all']).default('active'),
});
export type ListAccountsQueryDto = z.infer<typeof listAccountsQuerySchema>;
