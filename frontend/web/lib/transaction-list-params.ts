import type { TransactionType } from "./types";

/**
 * The transaction list's type, recurrence and sort filters: the values the
 * search endpoint accepts, their labels, and readers for URL params (an
 * unknown value reads as "not set" rather than reaching the backend, which
 * would reject it).
 */

export const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
  { value: "TRANSFER", label: "Transfer" },
];

export type Recurrence = "recurring" | "one-off";

export const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: "recurring", label: "Recurring only" },
  { value: "one-off", label: "One-off only" },
];

export type TransactionSort = "newest" | "oldest" | "amount-desc" | "amount-asc";

export const DEFAULT_SORT: TransactionSort = "newest";

export const SORT_OPTIONS: { value: TransactionSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount-desc", label: "Amount: high to low" },
  { value: "amount-asc", label: "Amount: low to high" },
];

// The search endpoint also takes these, for the Recurring view: each series once
// (by its root), active ones first by next date. Not offered as list filters.
export type SearchRecurrence = Recurrence | "series";
export type SearchSort = TransactionSort | "next-occurrence";

/** The page's views: every transaction, or the recurring series (?view=recurring). */
export type TransactionsView = "all" | "recurring";

export function parseView(value: string | undefined): TransactionsView {
  return value === "recurring" ? "recurring" : "all";
}

function pick<T extends string>(options: { value: T }[], value: string | undefined): T | undefined {
  return options.find((o) => o.value === value)?.value;
}

export const parseType = (value: string | undefined) => pick(TYPE_OPTIONS, value);
export const parseRecurrence = (value: string | undefined) => pick(RECURRENCE_OPTIONS, value);
export const parseSort = (value: string | undefined) => pick(SORT_OPTIONS, value);

/** "Old savings (archived)" for an archived account, its plain name otherwise. */
export function accountOptionLabel(account: { name: string; archivedAt?: string | null }): string {
  return account.archivedAt ? `${account.name} (archived)` : account.name;
}
