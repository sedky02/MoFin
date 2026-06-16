import { DraftStatus, TransactionType } from '@prisma/client';
import { z } from 'zod';
import { amountStringSchema, currencySchema, dateStringSchema } from '../../../common/dto/common-fields';
import { paginationSchema } from '../../../common/dto/pagination';

/**
 * Zod validates nested objects by default, so unlike the previous
 * `@IsObject()`-only annotation, every field below is now actually enforced
 * (audit A1) — including when the draft is created via the AI or MCP paths.
 */
export const parsedDraftTransactionSchema = z.object({
  type: z.nativeEnum(TransactionType),
  description: z.string().min(1),
  amount: amountStringSchema,
  currency: currencySchema,
  occurredAt: dateStringSchema,
  fromAccountId: z.string().optional(),
  toAccountId: z.string().optional(),
  categoryId: z.string().optional(),
});
export type ParsedDraftTransaction = z.infer<typeof parsedDraftTransactionSchema>;

export const createDraftTransactionSchema = z.object({
  rawInput: z.string().min(1),
  parsedData: parsedDraftTransactionSchema,
  confidenceScore: z.number().min(0).max(1),
});
export type CreateDraftTransactionDto = z.infer<typeof createDraftTransactionSchema>;

export const rejectDraftSchema = z.object({
  reason: z.string().optional(),
});
export type RejectDraftDto = z.infer<typeof rejectDraftSchema>;

export const draftListQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(DraftStatus).optional(),
});
export type DraftListQuery = z.infer<typeof draftListQuerySchema>;
