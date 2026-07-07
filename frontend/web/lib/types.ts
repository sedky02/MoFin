// Hand-written domain types mirroring the MoFin REST backend (no codegen).
// Money values are ALWAYS decimal strings — never numbers. See lib/decimal.ts.

export type AccountType = "CASH" | "BANK" | "SAVINGS" | "CRYPTO";
export type CategoryType = "INCOME" | "EXPENSE";
export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER";
export type DraftStatus = "PENDING" | "APPROVED" | "REJECTED";
export type LedgerItemType = "DEBIT" | "CREDIT";
export type GoalType = "BALANCE" | "INCOME" | "EXPENSE";
export type GoalRecurrenceUnit = "MONTH" | "YEAR";
export type GoalStatus = "IN_PROGRESS" | "ACHIEVED" | "FAILED";

export interface User {
  id: string;
  email: string;
  displayName?: string | null;
  settings?: UserSettings | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  defaultCurrency?: string;
  // open-ended; backend stores arbitrary JSON settings
  [key: string]: unknown;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  metadata?: Record<string, unknown> | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  color?: string | null;
  icon?: string | null;
  isSystem: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LedgerItem {
  id: string;
  transactionId: string;
  accountId: string;
  account?: Account;
  // Backend field name; DEBIT = out of account, CREDIT = into account.
  direction: LedgerItemType;
  amount: string;
  currency: string;
  memo?: string | null;
}

// A Transaction is the business event; it has NO amount of its own — the money
// lives in `items` (double-entry ledger legs). Use transactionAmount() in
// lib/format to derive the display amount.
export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  currency: string;
  occurredAt: string;
  categoryId?: string | null;
  category?: Category | null;
  items: LedgerItem[];
  createdAt: string;
  updatedAt: string;
}

// Shape the AI parser fills in and the review form edits.
export interface ParsedTransactionData {
  type: TransactionType;
  description: string;
  amount: string;
  currency: string;
  occurredAt?: string;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
}

export interface DraftTransaction {
  id: string;
  rawInput: string;
  parsedData: ParsedTransactionData;
  confidenceScore: number;
  status: DraftStatus;
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
}

// A single period's snapshot — history is a series of these per goal.
export interface GoalInstance {
  id: string;
  goalId: string;
  periodStart: string;
  periodEnd: string;
  targetAmount: string;
  progressAmount: string;
  status: GoalStatus;
  computedAt: string;
}

// BALANCE/INCOME are "reach" goals (achieved once progress hits the target,
// stays achieved). EXPENSE is "stay under" (fails the moment it's exceeded).
// `currentInstance` is the live-recomputed open period; null once archived
// with no instance yet created.
export interface Goal {
  id: string;
  accountId: string;
  name: string;
  type: GoalType;
  targetAmount: string;
  isRecurring: boolean;
  recurrenceUnit?: GoalRecurrenceUnit | null;
  periodStart: string;
  periodEnd?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  currentInstance: GoalInstance | null;
}

export interface LedgerBalance {
  // key = currency (when queried with accountId) OR "<accountId>:<currency>" (without)
  key: string;
  balance: string;
}

export interface CategoryBreakdownItem {
  category: string;
  color?: string | null;
  amount: string;
}

export interface MonthlySummary {
  year: number;
  month: number;
  income: string;
  expenses: string;
  savingsRate: number;
  categoryBreakdown: CategoryBreakdownItem[];
}

// ---- Error shapes ----

export interface ApiError400 {
  message: string;
  errors: { path: string; message: string }[];
}

export interface ApiError {
  statusCode: number;
  message: string;
}

// Paginated/list responses are returned as bare arrays by this backend.
export type Paginated<T> = T[];
