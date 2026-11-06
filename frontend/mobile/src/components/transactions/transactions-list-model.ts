// The transactions list's filter state and how it reads as search params, chips and counts. The
// same rules as the web's SearchView; the screen only holds the values and renders.
import { formatPeriodDate, normalizeMoneyTyping } from '@/core/format';
import {
  accountOptionLabel,
  DEFAULT_SORT,
  parseRecurrence,
  parseSort,
  parseType,
  RECURRENCE_OPTIONS,
  SORT_OPTIONS,
  TYPE_OPTIONS,
  type TransactionSort,
} from '@/core/transaction-list-params';
import type { Account, Category } from '@/core/types';
import type { SearchParams } from '@/hooks/useSearch';

/**
 * The "Repeats" filter: core's two choices plus the recurring schedules, which list each series
 * once (with pause, resume, cancel); that value never reaches the search params.
 */
export const SCHEDULES = 'series';
export const REPEATS_OPTIONS: { value: string; label: string }[] = [
  ...RECURRENCE_OPTIONS,
  { value: SCHEDULES, label: 'Recurring schedules' },
];

/** What the user typed or picked. Empty string means "not set". */
export interface ListFilters {
  q: string;
  categoryId: string;
  accountId: string;
  from: string;
  to: string;
  minAmount: string;
  maxAmount: string;
  type: string;
  recurrence: string;
  sort: TransactionSort;
}

export const EMPTY_FILTERS: ListFilters = {
  q: '',
  categoryId: '',
  accountId: '',
  from: '',
  to: '',
  minAmount: '',
  maxAmount: '',
  type: '',
  recurrence: '',
  sort: DEFAULT_SORT,
};

export const PAGE_SIZE = 25;

/**
 * Amount fields keep what was typed; the query gets the dot-decimal reading ("1,234" -> 1234), or
 * nothing while unreadable. Unknown type, recurrence or sort values never reach the backend.
 */
export function toSearchParams(f: ListFilters, limit: number): SearchParams {
  return {
    q: f.q || undefined,
    categoryId: f.categoryId || undefined,
    accountId: f.accountId || undefined,
    from: f.from || undefined,
    to: f.to || undefined,
    minAmount: normalizeMoneyTyping(f.minAmount) || undefined,
    maxAmount: normalizeMoneyTyping(f.maxAmount) || undefined,
    type: parseType(f.type),
    recurrence: parseRecurrence(f.recurrence),
    sort: f.sort === DEFAULT_SORT ? undefined : parseSort(f.sort),
    limit,
  };
}

export function sortOrDefault(value: string | undefined): TransactionSort {
  return parseSort(value) ?? DEFAULT_SORT;
}

export function hasActiveFilters(f: ListFilters): boolean {
  const p = toSearchParams(f, 0);
  return !!(p.q || p.categoryId || p.accountId || p.from || p.to || p.minAmount || p.maxAmount || p.type || p.recurrence) || f.sort !== DEFAULT_SORT;
}

/**
 * The filters behind the sheet, counted for the button that opens it. Search, account and
 * category sit in the toolbar. The two ends of a range are one filter, and so is a non-default sort.
 */
export function panelFilterCount(f: ListFilters): number {
  return [f.type, f.recurrence, f.from || f.to, f.minAmount || f.maxAmount, f.sort !== DEFAULT_SORT].filter(Boolean).length;
}

export interface FilterChip {
  key: string;
  label: string;
  clears: (keyof ListFilters)[];
}

export function buildChips(f: ListFilters, accounts?: Account[], categories?: Category[]): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.accountId) {
    const account = accounts?.find((a) => a.id === f.accountId);
    chips.push({ key: 'account', label: account ? accountOptionLabel(account) : 'Account', clears: ['accountId'] });
  }
  if (f.categoryId) {
    chips.push({ key: 'category', label: categories?.find((c) => c.id === f.categoryId)?.name ?? 'Category', clears: ['categoryId'] });
  }
  const typeLabel = TYPE_OPTIONS.find((o) => o.value === f.type)?.label;
  if (typeLabel) chips.push({ key: 'type', label: typeLabel, clears: ['type'] });
  const recurrenceLabel = REPEATS_OPTIONS.find((o) => o.value === f.recurrence)?.label;
  if (recurrenceLabel) chips.push({ key: 'recurrence', label: recurrenceLabel, clears: ['recurrence'] });
  if (f.from || f.to) {
    chips.push({
      key: 'dates',
      label:
        f.from && f.to
          ? `${formatPeriodDate(f.from)} – ${formatPeriodDate(f.to)}`
          : f.from
            ? `From ${formatPeriodDate(f.from)}`
            : `Until ${formatPeriodDate(f.to)}`,
      clears: ['from', 'to'],
    });
  }
  if (f.minAmount || f.maxAmount) {
    chips.push({
      key: 'amount',
      label:
        f.minAmount && f.maxAmount
          ? `Amount ${f.minAmount} – ${f.maxAmount}`
          : f.minAmount
            ? `At least ${f.minAmount}`
            : `At most ${f.maxAmount}`,
      clears: ['minAmount', 'maxAmount'],
    });
  }
  if (f.sort !== DEFAULT_SORT) {
    chips.push({ key: 'sort', label: SORT_OPTIONS.find((o) => o.value === f.sort)?.label ?? f.sort, clears: ['sort'] });
  }
  return chips;
}

export function clearChip(f: ListFilters, chip: FilterChip): ListFilters {
  const next = { ...f };
  for (const field of chip.clears) (next as Record<string, unknown>)[field] = EMPTY_FILTERS[field];
  return next;
}

export function groupsByDay(sort: TransactionSort): boolean {
  return sort === 'newest' || sort === 'oldest';
}

export function loadedSummary(shown: number, total?: number): string {
  if (total === undefined || shown < total) return total === undefined ? `Showing ${shown}` : `Showing ${shown} of ${total}`;
  return total === 1 ? '1 transaction' : `All ${total} transactions`;
}
