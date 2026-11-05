import { TransactionType } from '@prisma/client';
import { localNoon } from '../../../common/utils/time-zone';
import { DraftContext, ProposedDraft } from './draft-context';
import { ModelDraft } from './model-draft-parser';

/** No draft is ever presented as certain: the user approves each one. */
export const MAX_CONFIDENCE = 0.95;
/** A draft still missing an account it needs. */
export const MISSING_ACCOUNT_CONFIDENCE = 0.4;
/** A draft whose account we had to swap for one the user owns. */
export const FIXED_ACCOUNT_CONFIDENCE = 0.5;

/**
 * The model can invent ids, leave out the account or pick a category of the
 * wrong kind. Keep only ids that belong to the user (and categories of the
 * right type), fall back to the default account, and lower the confidence for
 * anything we had to fix so the review screen flags it.
 */
export function repairDraft(
  draft: ModelDraft,
  ctx: DraftContext,
): ProposedDraft {
  let confidence = draft.confidence;
  const knownAccount = (id?: string) =>
    id && ctx.accounts.some((account) => account.id === id) ? id : undefined;
  const fallbackAccount = knownAccount(ctx.defaultAccountId);

  let fromAccountId = knownAccount(draft.fromAccountId);
  let toAccountId = knownAccount(draft.toAccountId);
  if (draft.type === TransactionType.EXPENSE) {
    toAccountId = undefined;
    fromAccountId ??= fallbackAccount;
  } else if (draft.type === TransactionType.INCOME) {
    fromAccountId = undefined;
    toAccountId ??= fallbackAccount;
  }
  const needsFrom = draft.type !== TransactionType.INCOME && !fromAccountId;
  const needsTo = draft.type !== TransactionType.EXPENSE && !toAccountId;
  if (needsFrom || needsTo)
    confidence = Math.min(confidence, MISSING_ACCOUNT_CONFIDENCE);
  if (draft.fromAccountId && fromAccountId !== draft.fromAccountId)
    confidence = Math.min(confidence, FIXED_ACCOUNT_CONFIDENCE);
  // A transfer to the same account moves nothing: almost surely a misread.
  if (
    draft.type === TransactionType.TRANSFER &&
    fromAccountId &&
    fromAccountId === toAccountId
  ) {
    toAccountId = undefined;
    confidence = Math.min(confidence, MISSING_ACCOUNT_CONFIDENCE);
  }

  const category = ctx.categories.find(
    (c) =>
      c.id === draft.categoryId &&
      draft.type !== TransactionType.TRANSFER &&
      c.type === draft.type,
  );

  // "Today" keeps the actual time; any other day is stored at local noon so it
  // stays on that calendar day in the user's zone.
  const occurredAt =
    draft.occurredAt === ctx.today
      ? ctx.now
      : localNoon(draft.occurredAt, ctx.timeZone);

  return {
    data: {
      type: draft.type,
      description: draft.description,
      amount: draft.amount,
      currency: draft.currency,
      occurredAt: occurredAt.toISOString(),
      fromAccountId,
      toAccountId,
      categoryId: category?.id,
    },
    confidence: Math.round(Math.min(confidence, MAX_CONFIDENCE) * 100) / 100,
  };
}
