import { AccountType } from '@prisma/client';
import { z } from 'zod';
import { currencySchema } from '../../../common/dto/common-fields';

export const createAccountSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(AccountType),
  currency: currencySchema,
  metadata: z.record(z.unknown()).optional(),
});
export type CreateAccountDto = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.nativeEnum(AccountType).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type UpdateAccountDto = z.infer<typeof updateAccountSchema>;
