import { TransactionType } from '@prisma/client';
import { localNoon } from '../../../common/utils/time-zone';
import { DraftContext, ProposedDraft } from './draft-context';
import { ModelDraft } from './model-draft-parser';

/** No draft is ever presented as certain: the user approves each one. */
export const MAX_CONFIDENCE = 0.95;
export const MISSING_ACCOUNT_CONFIDENCE = 0.4;
export const FIXED_ACCOUNT_CONFIDENCE = 0.5;

/**
 * A shared account uses its owner's categories, so a category fits only if it is global or that
 * owner's.
 */
export function categoryFitsAccount(
  categoryId: string | undefined,
  accountId: string | undefined,
  ctx: Pick<DraftContext, 'accounts' | 'categories'>,
): boolean {
  const category = ctx.categories.find((c) => c.id === categoryId);
  const owner = ctx.accounts.find((a) => a.id === accountId)?.userId;
  return (
    !!category && (!owner || !category.userId || category.userId === owner)
  );
}

/**
 * The model can invent ids or pick the wrong category type: keep only the user's ids, fall back to
 * the default account, and lower confidence for anything fixed so review flags it.
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
      c.type === draft.type &&
      categoryFitsAccount(c.id, fromAccountId ?? toAccountId, ctx),
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
