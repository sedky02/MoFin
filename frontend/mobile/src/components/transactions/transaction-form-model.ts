// Pure helpers behind TransactionForm, mirroring the web form line for line except date parsing
// (see localDateTimeToDate); the component holds no money or date logic.
import { add } from '@/core/decimal';
import { formatMoneyInput, normalizeMoneyTyping, parseMoneyInput } from '@/core/format';
import type { TransactionFormValues } from '@/core/transaction-schema';
import type { Account, TransactionType } from '@/core/types';
import type { CreateTransactionInput, UpdateTransactionInput } from '@/hooks/useTransactions';

export type TransactionItemValues = NonNullable<TransactionFormValues['items']>[number];

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
 * A `datetime-local` / `date` string as local time, or null. Built from its parts, since Hermes'
 * offset-less date parsing is unconfirmed (src/core/COPIED_FROM.md).
 */
export function localDateTimeToDate(value: string): Date | null {
  const m = LOCAL_DATE_TIME.exec(value);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  // Reject rollovers such as 2026-02-31.
  return date.getMonth() === Number(mo) - 1 && date.getDate() === Number(d) ? date : null;
}

export function localDateTimeToIso(value: string): string {
  const date = localDateTimeToDate(value) ?? new Date(value);
  return date.toISOString();
}

export function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * MoneyInput's blur tidy (normalise, then the currency's decimals) for a submit while a field still
 * has focus: on the web the click blurs first, a phone tap doesn't.
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
 * Only a picked account is stored; otherwise the suggested one (active, main, only, most used,
 * first). A transfer's destination defaults to another account in the same currency.
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

export function sourceAccountId(type: TransactionType, ids: { fromId?: string; toId?: string }) {
  return type === 'INCOME' ? ids.toId : ids.fromId;
}

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
