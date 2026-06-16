import { TransactionType } from '@prisma/client';
import { z } from 'zod';
import { amountStringSchema, currencySchema, dateStringSchema } from '../../../common/dto/common-fields';

/**
 * Shape validation only. Cross-field business rules (which account is required
 * for which type, distinct transfer accounts, amount > 0) live in
 * TransactionsService.validateCommand so the draft-approval and MCP paths share
 * exactly one source of truth.
 */
export const createTransactionSchema = z.object({
  type: z.nativeEnum(TransactionType),
  description: z.string().min(1),
  amount: amountStringSchema,
  currency: currencySchema,
  occurredAt: dateStringSchema,
  fromAccountId: z.string().optional(),
  toAccountId: z.string().optional(),
  categoryId: z.string().optional(),
});
export type CreateTransactionDto = z.infer<typeof createTransactionSchema>;

export interface CreateTransactionCommand {
  type: TransactionType;
  description: string;
  amount: string;
  currency: string;
  occurredAt: Date;
  fromAccountId?: string;
  toAccountId?: string;
  categoryId?: string;
  draftId?: string;
}
