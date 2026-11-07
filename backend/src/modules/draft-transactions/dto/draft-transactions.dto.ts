import { DraftStatus, Prisma, TransactionType } from '@prisma/client';
import { z } from 'zod';
import {
  amountStringSchema,
  currencySchema,
  dateStringSchema,
} from '../../../common/dto/common-fields';
import { paginationSchema } from '../../../common/dto/pagination';
import { transactionItemInputSchema } from '../../transactions/dto/transactions.dto';

export const parsedDraftTransactionObject = z.object({
  type: z.nativeEnum(TransactionType),
  description: z.string().min(1),
  amount: amountStringSchema,
  currency: currencySchema,
  occurredAt: dateStringSchema,
  fromAccountId: z.string().optional(),
  toAccountId: z.string().optional(),
  categoryId: z.string().optional(),
  items: z.array(transactionItemInputSchema).min(1).optional(),
});

type ParsedDraftShape = z.infer<typeof parsedDraftTransactionObject>;

// Mirrors TransactionsService.validateCommand so a bad split fails at draft creation, with a
// message the assistant can act on, instead of only when the user approves.
export function refineDraftItems(
  draft: ParsedDraftShape,
  ctx: z.RefinementCtx,
) {
  const { items } = draft;
  if (!items?.length) return;
  const fail = (message: string, path: (string | number)[] = ['items']) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });

  if (draft.type === TransactionType.TRANSFER) {
    fail('Transfers cannot be split into multiple items');
    return;
  }
  if (items.length > 1 && draft.categoryId) {
    fail(
      'A split draft cannot have its own categoryId; set a category on each item instead',
      ['categoryId'],
    );
  }
  items.forEach((item, index) => {
    if (new Prisma.Decimal(item.amount).lessThanOrEqualTo(0)) {
      fail('Each item amount must be greater than zero', [
        'items',
        index,
        'amount',
      ]);
    }
  });
  const total = items.reduce(
    (sum, item) => sum.plus(item.amount),
    new Prisma.Decimal(0),
  );
  if (!total.equals(new Prisma.Decimal(draft.amount))) {
    fail(
      `Item amounts add up to ${total.toFixed()} but amount is ${draft.amount}; amount must be the sum of the items`,
      ['amount'],
    );
  }
}

/** Nested objects are validated too, including for drafts created via AI or MCP. */
export const parsedDraftTransactionSchema =
  parsedDraftTransactionObject.superRefine(refineDraftItems);
export type ParsedDraftTransaction = z.infer<
  typeof parsedDraftTransactionSchema
>;

export const createDraftTransactionSchema = z.object({
  rawInput: z.string().min(1),
  parsedData: parsedDraftTransactionSchema,
  confidenceScore: z.number().min(0).max(1),
});
export type CreateDraftTransactionDto = z.infer<
  typeof createDraftTransactionSchema
>;

export const approveDraftSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    parsedData: parsedDraftTransactionObject
      .partial()
      .extend({
        // null removes the draft's items (back to a single line); omitted keeps them.
        items: parsedDraftTransactionObject.shape.items.nullable(),
      })
      .optional(),
  }),
);
export type ApproveDraftDto = z.infer<typeof approveDraftSchema>;

export const rejectDraftSchema = z.object({
  reason: z.string().optional(),
});
export type RejectDraftDto = z.infer<typeof rejectDraftSchema>;

export const draftListQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(DraftStatus).optional(),
});
export type DraftListQuery = z.infer<typeof draftListQuerySchema>;
