import { RecurringInterval, TransactionType } from '@prisma/client';
import { z } from 'zod';
import { amountStringSchema, currencySchema, dateStringSchema } from '../../../common/dto/common-fields';

// A single split line within a transaction's total amount, INCOME/EXPENSE only.
// `items` is optional — omitting it (or sending exactly one) is the plain,
// unsplit single-item transaction that already existed.
export const transactionItemInputSchema = z.object({
  amount: amountStringSchema,
  categoryId: z.string().optional(),
  memo: z.string().optional(),
});
export type TransactionItemInputDto = z.infer<typeof transactionItemInputSchema>;

/**
 * Shape validation only. Cross-field business rules (which account is required
 * for which type, distinct transfer accounts, amount > 0, split items summing
 * to the total) live in TransactionsService.validateCommand so the
 * draft-approval and MCP paths share exactly one source of truth.
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
  items: z.array(transactionItemInputSchema).min(1).optional(),
  isRecurring: z.boolean().optional(),
  recurringInterval: z.nativeEnum(RecurringInterval).optional(),
  recurringEndDate: dateStringSchema.optional(),
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
  items?: TransactionItemInputDto[];
  draftId?: string;
  isRecurring?: boolean;
  recurringInterval?: RecurringInterval;
  recurringEndDate?: Date;
  parentTransactionId?: string;
}

/**
 * Edits the recurrence template on a root recurring transaction. Only affects
 * occurrences generated from now on — it never touches the root's own
 * TransactionItem rows or any already-generated occurrence.
 */
export const updateRecurringTransactionSchema = z.object({
  description: z.string().min(1).optional(),
  amount: amountStringSchema.optional(),
  categoryId: z.string().nullable().optional(),
  fromAccountId: z.string().optional(),
  toAccountId: z.string().optional(),
  recurringInterval: z.nativeEnum(RecurringInterval).optional(),
  recurringEndDate: dateStringSchema.nullable().optional(),
});
export type UpdateRecurringTransactionDto = z.infer<typeof updateRecurringTransactionSchema>;

export interface UpdateRecurringTransactionCommand {
  description?: string;
  amount?: string;
  categoryId?: string | null;
  fromAccountId?: string;
  toAccountId?: string;
  recurringInterval?: RecurringInterval;
  recurringEndDate?: Date | null;
}
