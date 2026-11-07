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
export type RecurringInterval = "MONTHLY" | "YEARLY";
export type RecurringStatus = "ACTIVE" | "PAUSED" | "CANCELLED";
export type AccountMemberRole = "EDITOR" | "VIEWER";
export type AccountRole = "OWNER" | AccountMemberRole;

export interface User {
  id: string;
  email: string;
  displayName?: string | null;
  settings?: UserSettings | null;
  /** False for an account that only signs in with Google (no password to change). */
  hasPassword?: boolean;
  /** When this person proved they control `email`; accepting an invitation needs it. */
  emailVerifiedAt?: string | null;
  /** A temporary "Try the demo" user, deleted at `expiresAt`. */
  isDemo?: boolean;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  defaultCurrency?: string;
  /** Account the dashboard summary defaults to; absent = all accounts. */
  mainAccountId?: string;
  [key: string]: unknown;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  /** Decimal string in the account's currency, added to its balance. Never a transaction. */
  openingBalance?: string;
  metadata?: Record<string, unknown> | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  role?: AccountRole;
  isShared?: boolean;
  memberCount?: number;
  ownerName?: string | null;
}

/** Someone on a shared account. `email` is for the owner, and for your own row. */
export interface AccountMember {
  userId: string;
  displayName?: string | null;
  email?: string | null;
  role: AccountRole;
  isYou: boolean;
  joinedAt: string;
}

export interface AccountInvitation {
  id: string;
  accountId: string;
  email: string;
  role: AccountMemberRole;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "REVOKED";
  expiresAt: string;
  createdAt: string;
}

export interface InvitationPreview {
  accountName: string;
  currency: string;
  invitedBy: string;
  email: string;
  role: AccountMemberRole;
  expiresAt: string;
}

/** An account the user owns that others can reach: what deleting their data takes from those people. */
export interface OwnedSharedAccount {
  id: string;
  name: string;
  archivedAt?: string | null;
  members: { userId: string; displayName?: string | null; email: string; role: AccountMemberRole }[];
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  color?: string | null;
  icon?: string | null;
  isSystem: boolean;
  /** Set when archived: hidden from pickers, still shown on the transactions that use it. */
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LedgerItem {
  id: string;
  transactionId: string;
  accountId: string;
  account?: Account;
  categoryId?: string | null;
  category?: Category | null;
  // out -
  direction: LedgerItemType;
  amount: string;
  currency: string;
  memo?: string | null;
}

// A transaction has no amount of its own: the money lives in `items` (ledger legs); use
// transactionAmount() in lib/format.
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
  /** Whether this viewer may change it. Absent right after creating one, which they may. */
  canEdit?: boolean;
  /** Who entered it and who last changed it; null once that person has left MoFin. */
  createdBy?: { id: string; displayName?: string | null } | null;
  updatedBy?: { id: string; displayName?: string | null } | null;

  // Recurrence is only meaningful on the root that started a series (isRecurring, no
  // parentTransactionId); occurrences point back to it.
  isRecurring: boolean;
  recurringInterval?: RecurringInterval | null;
  recurringStatus?: RecurringStatus | null;
  recurringEndDate?: string | null;
  nextOccurrenceAt?: string | null;
  recurringAmount?: string | null;
  recurringFromAccountId?: string | null;
  recurringToAccountId?: string | null;
  // Why the series was paused when it couldn't post (an archived account...);
  // empty for a manual pause, cleared on resume.
  recurringError?: string | null;
  lastFailedAt?: string | null;
  parentTransactionId?: string | null;
}

export interface ParsedTransactionData {
  type: TransactionType;
  description: string;
  amount: string;
  currency: string;
  occurredAt?: string;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  items?: ParsedTransactionItem[] | null;
}

export interface ParsedTransactionItem {
  amount: string;
  categoryId?: string | null;
  memo?: string | null;
}

export interface DraftTransaction {
  id: string;
  rawInput: string;
  parsedData: ParsedTransactionData;
  // Prisma Decimal serializes to a string over the wire, not a number.
  confidenceScore: string;
  status: DraftStatus;
  reason?: string | null;
  /** Where it came from: the Drafts page input, the chat (typed or spoken), or a connected app. */
  source: DraftSource;
  sourceClient?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DraftSource = "COMPOSER" | "CHAT" | "VOICE" | "MCP";

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

// Only on history rows: LIVE = the open period, computed now; PERIOD_END = recorded when the period
// ended; ENDED = frozen when the goal was cancelled.
export type GoalProgressSource = "LIVE" | "PERIOD_END" | "ENDED";

export interface GoalHistoryInstance extends GoalInstance {
  progressSource: GoalProgressSource;
}

// BALANCE/INCOME are "reach" goals: achieved once progress hits the target, and it stays so.
// EXPENSE is "stay under": over the cap is Failed, achieved only at period end.
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
  // analytics.service.ts computes this via `.toFixed(4)` — a decimal string, not a number.
  savingsRate: string;
  categoryBreakdown: CategoryBreakdownItem[];
  activeCurrencies?: string[];
  /** Income by category; absent on payloads cached before it existed. */
  incomeBreakdown?: CategoryBreakdownItem[];
}

export interface ApiError400 {
  message: string;
  errors: { path: string; message: string }[];
}

export interface ApiError {
  statusCode: number;
  message: string;
  code?: string;
}

// The "Ask" chat on the Drafts page. The client keeps the conversation and
// sends it whole; the server stores nothing.
/**
 * A chart attached to an assistant answer. The server computes every number
 * from the ledger; the model only chose which chart. Amounts are decimal strings.
 */
export interface AiChart {
  kind: "donut" | "bar" | "line";
  title: string;
  currency: string;
  /** How to read `labels`: YYYY-MM months, YYYY-MM-DD days, or plain text. */
  axis: "month" | "day" | "category";
  labels: string[];
  series: {
    name: string;
    tone: "income" | "expense" | "balance" | "neutral";
    values: string[];
  }[];
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Tools the assistant read from to answer, e.g. "get_monthly_summary". */
  usedTools: string[];
  charts: AiChart[];
  /** Drafts this answer created, in their current state (approved or rejected elsewhere shows here). */
  drafts: DraftTransaction[];
  createdAt: string;
}

export interface AiChatSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatDetail extends AiChatSummary {
  messages: AiChatMessage[];
}

/** What sending a question returns: the chat (new or updated) and the two saved turns. */
export interface AiChatTurn {
  chat: AiChatSummary;
  messages: [AiChatMessage, AiChatMessage];
}

// Paginated list responses (search/transactions, draft-transactions).
export interface Paginated<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

/** An AI app (MCP client) the user has approved via OAuth. */
export interface ConnectedApp {
  clientId: string;
  clientName: string | null;
  scope: string;
  /** Still holds a live refresh token, i.e. can currently renew access. */
  active: boolean;
}

export interface MonthlySeriesPoint {
  /** "YYYY-MM" (UTC) */
  month: string;
  income: string;
  expenses: string;
  /** Closing balance at the end of the month. */
  balance: string;
}
export interface MonthlySeries {
  currency: string;
  points: MonthlySeriesPoint[];
}

export interface DailySeriesPoint {
  /** "YYYY-MM-DD" in the series' time zone. */
  date: string;
  income: string;
  expenses: string;
  /** Closing balance at the end of the day. */
  balance: string;
}
export interface DailySeries {
  currency: string;
  timeZone: string;
  points: DailySeriesPoint[];
}
