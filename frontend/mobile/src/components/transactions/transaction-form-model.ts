// Pure helpers behind TransactionForm: the blank values, the derived accounts, the split total and
// the submit mapping. They mirror frontend/web/components/transactions/transaction-form.tsx line for
// line (only the date parsing differs, see localDateTimeToDate) and use the copied src/core helpers
// for every amount, so the form component itself holds no money or date logic.
import { add } from '@/core/decimal';
import { formatMoneyInput, normalizeMoneyTyping, parseMoneyInput } from '@/core/format';
import type { TransactionFormValues } from '@/core/transaction-schema';
import type { Account, TransactionType } from '@/core/types';
import type { CreateTransactionInput, UpdateTransactionInput } from '@/hooks/useTransactions';

export type TransactionItemValues = NonNullable<TransactionFormValues['items']>[number];

/** The web's BLANK, plus an empty split list (the web passes `items: []` on reset). */
export const BLANK: TransactionFormValues = {
  type: 'EXPENSE',
  description: '',
  amountRaw: '',
  currency: '',
  fromAccountId: undefined,
  toAccountId: undefined,
  categoryId: undefined,
  occurredAt: '',
  items: [],
  isRecurring: false,
  recurringInterval: undefined,
  recurringEndDate: '',
};

export const DESCRIPTION_PLACEHOLDER: Record<TransactionType, string> = {
  EXPENSE: 'Description, e.g. Coffee with Sam',
  INCOME: 'Description, e.g. March salary',
  TRANSFER: 'Description, e.g. Move to savings',
};

export const EMPTY_ITEM: TransactionItemValues = { amountRaw: '', categoryId: undefined, description: '' };

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * A `datetime-local` / `date` string ("2026-11-03T14:05", "2026-11-03", "2026-11-03T23:59:59") read
 * as the device's local time, or null when it isn't one.
 *
 * The web calls `new Date(value)`, which the spec reads as local time for these forms. Hermes'
 * handling of the offset-less form is not confirmed on a device yet (src/core/COPIED_FROM.md), so
 * the app builds the date from its parts instead: identical on a spec-following engine, and correct
 * on one that would read it as UTC.
 */
export function localDateTimeToDate(value: string): Date | null {
  const m = LOCAL_DATE_TIME.exec(value);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  // Reject rollovers such as 2026-02-31.
  return date.getMonth() === Number(mo) - 1 && date.getDate() === Number(d) ? date : null;
}

/** `new Date(local).toISOString()` from the web, through localDateTimeToDate. */
export function localDateTimeToIso(value: string): string {
  const date = localDateTimeToDate(value) ?? new Date(value);
  return date.toISOString();
}

/** A YYYY-MM-DD string for a Date, in local time (the web's `<input type="date">` value). */
export function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * What MoneyInput does on blur (normalise, then the currency's decimals), for a submit that comes
 * while a field still has focus. On the web the click blurs the field first; a tap on a phone does
 * not, so the form applies the same tidy before validating.
 */
export function tidyMoneyText(raw: string, currency?: string): string {
  const normalized = raw ? normalizeMoneyTyping(raw) : null;
  if (normalized === null) return raw;
  return formatMoneyInput(normalized, currency) || raw;
}

/** The split lines' total with the currency's decimals ("96.30", not "96.3"), as the web shows it. */
export function splitItemsTotal(items: TransactionItemValues[] | undefined, currency?: string): string {
  return formatMoneyInput(
    (items ?? []).reduce((sum, item) => add(sum, parseMoneyInput(item.amountRaw) ?? '0'), '0'),
    currency || undefined,
  );
}

/**
 * The accounts the form shows and submits. Only a picked account is stored; otherwise the suggested
 * one (active, main, only, most used, first). A transfer's destination defaults to another account
 * in the same currency.
 */
export function effectiveAccountIds({
  type,
  accounts,
  fromAccountId,
  toAccountId,
  suggestedAccountId,
}: {
  type: TransactionType;
  accounts: Account[];
  fromAccountId?: string;
  toAccountId?: string;
  suggestedAccountId?: string;
}): { fromId?: string; toId?: string } {
  const inList = (id?: string) => (id && accounts.some((a) => a.id === id) ? id : undefined);
  const fromId = inList(fromAccountId) ?? suggestedAccountId;
  let toId = inList(toAccountId);
  if (!toId) {
    if (type === 'INCOME') toId = suggestedAccountId;
    else {
      const from = accounts.find((a) => a.id === fromId);
      const others = accounts.filter((a) => a.id !== fromId);
      toId = (others.find((a) => a.currency === from?.currency) ?? others[0] ?? accounts[0])?.id;
    }
  }
  return { fromId, toId };
}

/** The account whose currency the transaction takes: the receiving one for income, else the source. */
export function sourceAccountId(type: TransactionType, ids: { fromId?: string; toId?: string }) {
  return type === 'INCOME' ? ids.toId : ids.fromId;
}

/** The fields create and update share, exactly as the web's `action()` builds them. */
export function buildTransactionFields(v: TransactionFormValues, splitting: boolean): UpdateTransactionInput | null {
  const amount = parseMoneyInput(v.amountRaw);
  if (!amount) return null;

  const splitItems =
    splitting && v.items && v.items.length > 1
      ? v.items.map((item) => ({
          amount: parseMoneyInput(item.amountRaw)!,
          categoryId: item.categoryId || undefined,
          memo: item.description?.trim() || undefined,
        }))
      : undefined;

  return {
    type: v.type,
    description: v.description,
    amount,
    currency: v.currency,
    occurredAt: localDateTimeToIso(v.occurredAt),
    fromAccountId: v.type !== 'INCOME' ? v.fromAccountId : undefined,
    toAccountId: v.type !== 'EXPENSE' ? v.toAccountId : undefined,
    categoryId: v.type !== 'TRANSFER' && !splitItems ? v.categoryId : undefined,
    items: splitItems,
  };
}

/** The create payload: the shared fields plus the recurrence (never with a split). */
export function buildCreateInput(v: TransactionFormValues, splitting: boolean): CreateTransactionInput | null {
  const fields = buildTransactionFields(v, splitting);
  if (!fields) return null;
  const recurring = !splitting && !!v.isRecurring;
  return {
    ...fields,
    isRecurring: recurring ? true : undefined,
    recurringInterval: recurring ? v.recurringInterval : undefined,
    recurringEndDate:
      recurring && v.recurringEndDate ? localDateTimeToIso(`${v.recurringEndDate}T23:59:59`) : undefined,
  };
}
