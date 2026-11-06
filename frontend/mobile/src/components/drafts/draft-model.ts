// Pure logic behind the drafts screens, mirroring the web's draft-card and draft-review-form. Every
// amount goes through the copied core helpers (draftAmountInput, parseMoneyInput, tryParse); the
// components only render what comes back.
import { localDateTimeToIso } from '@/components/transactions/transaction-form-model';
import { tryParse } from '@/core/decimal';
import { draftAmountInput } from '@/core/draft-review';
import { parseMoneyInput, toDatetimeLocal } from '@/core/format';
import { makeTransactionSchema, type TransactionFormValues } from '@/core/transaction-schema';
import type { Account, DraftTransaction, ParsedTransactionData } from '@/core/types';

/** Example sentences for the composer: plain what a tap puts in the box. */
export const EXAMPLES = [
  'Spent 42.50 on groceries at the market yesterday',
  'Got paid 3200 salary into my bank account',
  'Moved 500 from checking to savings',
];

/**
 * Quick approve skips the review form, so it is only allowed when everything the ledger entry needs
 * is present and the AI was reasonably sure.
 */
export function quickApproveState(draft: DraftTransaction): { blocked: boolean; reason: string } {
  const p = draft.parsedData;
  const needsAccounts =
    p.type === 'EXPENSE'
      ? !p.fromAccountId
      : p.type === 'INCOME'
        ? !p.toAccountId
        : p.type === 'TRANSFER'
          ? !p.fromAccountId || !p.toAccountId
          : true;
  const lowConfidence = (tryParse(draft.confidenceScore)?.toNumber() ?? 0) < 0.5;
  const blocked = !p.amount || !p.currency || needsAccounts || lowConfidence;
  const reason =
    !p.amount || !p.currency ? 'Missing amount or currency' : needsAccounts ? 'No account chosen' : 'Low AI confidence';
  return { blocked, reason };
}

/** "Cash → Savings", "Into Cash", "From Cash", or null when the accounts aren't known. */
export function draftAccountSummary(p: ParsedTransactionData, accounts: Account[] | undefined): string | null {
  const name = (id?: string | null) => accounts?.find((a) => a.id === id)?.name;
  const from = name(p.fromAccountId);
  const to = name(p.toAccountId);
  if (p.type === 'TRANSFER') return from && to ? `${from} → ${to}` : null;
  if (p.type === 'INCOME') return to ? `Into ${to}` : null;
  return from ? `From ${from}` : null;
}

/** The draft's amount as the card shows it: an expense is negative. */
export function draftDisplayAmount(p: ParsedTransactionData): string | null {
  if (!p.amount || !p.currency) return null;
  return p.type === 'EXPENSE' ? `-${p.amount.replace(/^-/, '')}` : p.amount;
}

export type ConfidenceTier = { label: string; tier: 'high' | 'medium' | 'low' | 'none' };

export function confidenceTier(score: string): ConfidenceTier {
  const parsed = tryParse(score);
  if (!parsed) return { label: '—', tier: 'none' };
  const pct = Math.round(parsed.toNumber() * 100);
  const tier = parsed.greaterThanOrEqualTo('0.8') ? 'high' : parsed.greaterThanOrEqualTo('0.5') ? 'medium' : 'low';
  return { label: `${pct}% sure`, tier };
}

/**
 * The review form's starting values: the web's defaultValues, plus its two "pre-select a default
 * account" and "currency follows the account" effects applied up front.
 */
export function initialReviewValues(draft: DraftTransaction, accounts: Account[]): TransactionFormValues {
  const p = draft.parsedData;
  const values: TransactionFormValues = {
    type: p.type ?? 'EXPENSE',
    description: p.description ?? draft.rawInput,
    amountRaw: draftAmountInput(p),
    currency: p.currency ?? '',
    fromAccountId: p.fromAccountId ?? undefined,
    toAccountId: p.toAccountId ?? undefined,
    categoryId: p.categoryId ?? undefined,
    occurredAt: toDatetimeLocal(p.occurredAt),
  };
  return withDefaultAccounts(values, accounts);
}

/** Fills the accounts the parser left empty (first account; transfer destination: the second) and syncs the currency. */
export function withDefaultAccounts(values: TransactionFormValues, accounts: Account[]): TransactionFormValues {
  let next = values;
  if (accounts.length > 0) {
    next = {
      ...next,
      fromAccountId: next.fromAccountId || accounts[0].id,
      toAccountId: next.toAccountId || (accounts[1] ?? accounts[0]).id,
    };
  }
  return syncCurrency(next, accounts);
}

/** The transaction takes its source account's currency (the receiving account's for income). */
export function syncCurrency(values: TransactionFormValues, accounts: Account[]): TransactionFormValues {
  const sourceId = values.type === 'INCOME' ? values.toAccountId : values.fromAccountId;
  const acct = accounts.find((a) => a.id === sourceId);
  return acct && acct.currency !== values.currency ? { ...values, currency: acct.currency } : values;
}

export type ReviewErrors = Partial<Record<keyof TransactionFormValues, string>>;

/** Validates the review form with the web's transaction schema; on success, the edits sent with the approval. */
export function buildApproval(
  values: TransactionFormValues,
  accounts: Account[],
): { ok: true; edits: Partial<ParsedTransactionData> } | { ok: false; errors: ReviewErrors } {
  const result = makeTransactionSchema(accounts).safeParse(values);
  if (!result.success) {
    const errors: ReviewErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof TransactionFormValues;
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const v = result.data;
  const amount = parseMoneyInput(v.amountRaw);
  if (!amount) return { ok: false, errors: { amountRaw: 'Enter an amount greater than 0.' } };
  return {
    ok: true,
    edits: {
      type: v.type,
      description: v.description,
      amount,
      currency: v.currency,
      occurredAt: localDateTimeToIso(v.occurredAt),
      fromAccountId: v.type !== 'INCOME' ? v.fromAccountId : undefined,
      toAccountId: v.type !== 'EXPENSE' ? v.toAccountId : undefined,
      categoryId: v.type !== 'TRANSFER' ? v.categoryId : undefined,
    },
  };
}

/**
 * Why a draft was rejected. The API sends `rejectionReason`; the copied type (and the web card)
 * read `reason`, which the API never sets, so the web never shows it. Reading both fixes it here.
 */
export function rejectionReasonOf(draft: DraftTransaction): string | null {
  const raw = draft as DraftTransaction & { rejectionReason?: string | null };
  return raw.reason || raw.rejectionReason || null;
}

/**
 * Where a draft came from, as the inbox labels it: the Drafts page input, the
 * Ask chat (typed or spoken), or the connected app by name.
 */
export function draftSourceLabel(draft: Pick<DraftTransaction, 'source' | 'sourceClient'>): string {
  switch (draft.source) {
    case 'CHAT':
      return 'Ask MoFin';
    case 'VOICE':
      return 'Voice';
    case 'MCP':
      return draft.sourceClient?.trim() || 'Connected app';
    default:
      return 'Drafts';
  }
}
