import { TransactionType } from '@prisma/client';
import { DraftContext, ProposedDraft } from './draft-context';

/**
 * A regex guess is never a confident one: at most this, so the review screen
 * flags it like a model draft it had to repair. Lower still when the amount is
 * a pick between several numbers, or missing.
 */
export const REGEX_CONFIDENCE = { single: 0.4, ambiguous: 0.3, noAmount: 0.2 };

const CURRENCY_CODES = /\b(TND|USD|EUR|GBP|JPY|CAD|AUD|BTC|ETH)\b/i;
const CURRENCY_SYMBOLS: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
};
// 1,200.50 | 1200,5 | 12.5 | 40
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?/g;
const INCOME_WORDS = /\b(received|income|salary|paid me|refund|got paid)\b/i;

/** "1,200.50" -> "1200.50", "12,5" -> "12.5". */
function normalise(raw: string): string {
  return /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)
    ? raw.replace(/,/g, '')
    : raw.replace(',', '.');
}

/**
 * The amount next to a currency mark when there is one ("2 coffees for 5 TND"
 * -> 5); otherwise the largest number, which is more often the price than a
 * count ("50 for 2 tickets" -> 50).
 */
function pickAmount(input: string): { amount: string; candidates: number } {
  const numbers = [...input.matchAll(NUMBER)];
  if (!numbers.length) return { amount: '0', candidates: 0 };
  const marked = numbers.find((match) => {
    const index = match.index;
    const before = input.slice(Math.max(0, index - 4), index);
    const after = input.slice(
      index + match[0].length,
      index + match[0].length + 5,
    );
    return (
      /[$€£¥]\s*$/.test(before) ||
      new RegExp(`^\\s*(${CURRENCY_CODES.source}|dt|dinars?)`, 'i').test(after)
    );
  });
  if (marked) return { amount: normalise(marked[0]), candidates: 1 };
  const values = numbers.map((match) => normalise(match[0]));
  const largest = values.reduce((a, b) => (Number(b) > Number(a) ? b : a));
  return { amount: largest, candidates: numbers.length };
}

/**
 * The fallback when no model is configured or it fails: one draft, read with
 * a few regexes. Never blocks drafting, and never sounds sure of itself.
 */
export function parseWithRegex(ctx: DraftContext): ProposedDraft {
  const { amount, candidates } = pickAmount(ctx.input);
  const symbol = Object.keys(CURRENCY_SYMBOLS).find((s) =>
    ctx.input.includes(s),
  );
  const defaultAccount =
    ctx.accounts.find((account) => account.id === ctx.defaultAccountId) ??
    (ctx.accounts.length === 1 ? ctx.accounts[0] : undefined);
  const currency = (
    CURRENCY_CODES.exec(ctx.input)?.[1] ??
    (symbol ? CURRENCY_SYMBOLS[symbol] : undefined) ??
    ctx.defaultCurrency ??
    defaultAccount?.currency ??
    ctx.accounts[0]?.currency ??
    'TND'
  ).toUpperCase();
  const type = INCOME_WORDS.test(ctx.input)
    ? TransactionType.INCOME
    : TransactionType.EXPENSE;

  const confidence =
    candidates === 0
      ? REGEX_CONFIDENCE.noAmount
      : candidates > 1
        ? REGEX_CONFIDENCE.ambiguous
        : REGEX_CONFIDENCE.single;

  return {
    data: {
      type,
      description: ctx.input.trim().slice(0, 200),
      amount,
      currency,
      occurredAt: ctx.now.toISOString(),
      fromAccountId:
        type === TransactionType.EXPENSE ? defaultAccount?.id : undefined,
      toAccountId:
        type === TransactionType.INCOME ? defaultAccount?.id : undefined,
    },
    confidence,
  };
}
