import { RecurringInterval, TransactionType } from '@prisma/client';
import { z } from 'zod';
import {
  amountStringSchema,
  currencySchema,
  dateStringSchema,
} from '../../../common/dto/common-fields';

// A split line within the total, INCOME/EXPENSE only. `items` is optional: omitted (or exactly one)
// is the plain unsplit transaction.
export const transactionItemInputSchema = z.object({
  amount: amountStringSchema,
  categoryId: z.string().optional(),
  memo: z.string().optional(),
});
export type TransactionItemInputDto = z.infer<
  typeof transactionItemInputSchema
>;

/**
 * Shape validation only: cross-field rules live in TransactionsService.validateCommand, so draft
 * approval and MCP share one source of truth.
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
  createdById?: string | null;
  isRecurring?: boolean;
  recurringInterval?: RecurringInterval;
  recurringEndDate?: Date;
  parentTransactionId?: string;
}

/**
 * Replaces every field (the edit form sends the whole transaction). Recurrence isn't part of it: a
 * series template is edited through PATCH /transactions/:id/recurring.
 */
export const updateTransactionSchema = createTransactionSchema.omit({
  isRecurring: true,
  recurringInterval: true,
  recurringEndDate: true,
});
export type UpdateTransactionDto = z.infer<typeof updateTransactionSchema>;

export type UpdateTransactionCommand = Omit<
  CreateTransactionCommand,
  | 'draftId'
  | 'createdById'
  | 'isRecurring'
  | 'recurringInterval'
  | 'recurringEndDate'
  | 'parentTransactionId'
>;

/**
 * Edits the recurrence template; only occurrences generated from now on are affected, never the
 * root's own entries or existing occurrences.
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
export type UpdateRecurringTransactionDto = z.infer<
  typeof updateRecurringTransactionSchema
>;

export interface UpdateRecurringTransactionCommand {
  description?: string;
  amount?: string;
  categoryId?: string | null;
  fromAccountId?: string;
  toAccountId?: string;
  recurringInterval?: RecurringInterval;
  recurringEndDate?: Date | null;
}
