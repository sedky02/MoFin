// The Summary widget's numbers and words, worked out in the app: widgets can't fetch or compute
// anything themselves, so they get finished strings. Pure functions, tested in summary-data.test.ts.
import { isAmountHidden, MASKED_AMOUNT } from '@/core/account-privacy';
import { totalsByCurrency } from '@/core/balances';
import { add } from '@/core/decimal';
import { scopeBalances } from '@/core/dashboard-scope';
import { formatMoney, pickPrimaryCurrency } from '@/core/format';
import type { Account, DailySeriesPoint, LedgerBalance, User } from '@/core/types';
import { mondayOf } from '@/core/week';

export type WidgetPeriod = 'month' | 'week';
/** "All accounts", as opposed to one account's id. */
export const ALL_ACCOUNTS = 'all';

/** What the user picked for the Summary widget in Settings → Widgets. */
export type SummaryConfig = { period: WidgetPeriod; accountId: string };
export const DEFAULT_SUMMARY_CONFIG: SummaryConfig = { period: 'month', accountId: ALL_ACCOUNTS };

/** Links the widget opens. They go through the allow-list in src/lib/deep-links.ts. */
export const WIDGET_LINKS = {
  dashboard: 'mofin://dashboard',
  refreshDashboard: 'mofin://refresh?to=dashboard',
} as const;

/**
 * What the widget draws. Every value is display-ready: the widget only lays it out.
 * - `data`: the numbers, with when they were fetched and an optional note under them;
 * - `message`: no numbers to show (signed out, no accounts, nothing loaded yet).
 */
export type SummaryWidgetProps = {
  kind: 'data' | 'message';
  /** "This month" or "This week". */
  title: string;
  /** "All accounts · TND" or the account's name. */
  scope: string;
  balance: string;
  income: string;
  expenses: string;
  /** "Updated 6 Nov, 14:32". */
  updated: string;
  /** "", "Updating…", "Couldn't update", "Sign in to update" or a configuration note. */
  note: string;
  /** What a `message` widget says. */
  message: string;
  openUrl: string;
  refreshUrl: string;
};

const EMPTY: SummaryWidgetProps = {
  kind: 'message',
  title: '',
  scope: '',
  balance: '',
  income: '',
  expenses: '',
  updated: '',
  note: '',
  message: '',
  openUrl: WIDGET_LINKS.dashboard,
  refreshUrl: WIDGET_LINKS.refreshDashboard,
};

/** Before the app has pushed anything. */
export const INITIAL_SUMMARY_PROPS: SummaryWidgetProps = { ...EMPTY, message: 'Open MoFin to load your summary.' };
/** Signed out: nothing financial stays on the home screen. */
export const SIGNED_OUT_SUMMARY_PROPS: SummaryWidgetProps = { ...EMPTY, message: 'Open MoFin to sign in.' };
export const NO_ACCOUNTS_SUMMARY_PROPS: SummaryWidgetProps = { ...EMPTY, message: 'Add an account in MoFin to see your summary.' };

export const NOTES = {
  updating: 'Updating…',
  failed: "Couldn't update",
  signIn: 'Sign in to update',
  accountGone: 'Account removed. Pick another in Settings.',
} as const;

export function periodTitle(period: WidgetPeriod): string {
  return period === 'week' ? 'This week' : 'This month';
}

/** What the summary covers for `period`, as of `today` (YYYY-MM-DD in the device's zone). Weeks start on Monday. */
export function periodRange(
  period: WidgetPeriod,
  today: string,
): { year: number; month: number; from: string; days: number } {
  const [year, month] = today.split('-').map(Number) as [number, number];
  if (period === 'week') return { year, month, from: mondayOf(today), days: 7 };
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, from: `${today.slice(0, 7)}-01`, days: daysInMonth };
}

/**
 * The account the widget covers. An account that is gone or archived falls back to all accounts,
 * and says so, rather than showing numbers for something that no longer exists.
 */
export function resolveScope(config: SummaryConfig, accounts: Account[]): { account?: Account; missing: boolean } {
  if (config.accountId === ALL_ACCOUNTS) return { missing: false };
  const account = accounts.find((a) => a.id === config.accountId);
  return account ? { account, missing: false } : { missing: true };
}

/**
 * The currency the numbers are in: the account's own, else the user's primary one (the dashboard's
 * rule). Amounts are never added across currencies.
 */
export function scopeCurrency(account: Account | undefined, balances: LedgerBalance[], user: User | undefined, accounts: Account[]): string {
  return account?.currency ?? pickPrimaryCurrency(balances, user, '', accounts);
}

/** Today's balance for the scope, in `currency`, from the all-accounts balance rows. */
export function scopeBalance(all: LedgerBalance[], account: Account | undefined, currency: string): string {
  const rows = account ? scopeBalances(all, account.id) : all;
  return totalsByCurrency(rows).find((t) => t.currency === currency)?.amount ?? '0';
}

/** A week's income and expenses from its daily points. Days still to come are zero. */
export function sumDays(points: DailySeriesPoint[]): { income: string; expenses: string } {
  return points.reduce(
    (sum, p) => ({ income: add(sum.income, p.income), expenses: add(sum.expenses, p.expenses) }),
    { income: '0', expenses: '0' },
  );
}

/** An amount in place of which the widget shows dots. The currency stays, so the scope reads right. */
export function maskedAmount(currency: string): string {
  return `${MASKED_AMOUNT} ${currency}`;
}

/** Whether amounts are hidden: everywhere in widgets, or for an account the user hid. */
export function amountsHidden(hideInWidgets: boolean, account: Account | undefined): boolean {
  return hideInWidgets || isAmountHidden(account);
}

/**
 * "Updated 6 Nov, 14:32". Always with the date: the widget can't redraw the words by itself, so
 * "14:32" alone would read as today's on the next day.
 */
export function updatedLabel(at: Date, locale?: string): string {
  const when = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
  return `Updated ${when}`;
}

export function summaryProps(input: {
  config: SummaryConfig;
  accounts: Account[];
  account: Account | undefined;
  missing: boolean;
  currency: string;
  balance: string;
  income: string;
  expenses: string;
  hidden: boolean;
  at: Date;
  locale?: string;
}): SummaryWidgetProps {
  const { account, currency, hidden } = input;
  if (!input.accounts.length) return NO_ACCOUNTS_SUMMARY_PROPS;
  const money = (amount: string) => (hidden ? maskedAmount(currency) : formatMoney(amount, currency));
  return {
    ...EMPTY,
    kind: 'data',
    title: periodTitle(input.config.period),
    scope: account ? account.name : `All accounts · ${currency}`,
    balance: money(input.balance),
    income: money(input.income),
    expenses: money(input.expenses),
    updated: updatedLabel(input.at, input.locale),
    note: input.missing ? NOTES.accountGone : '',
  };
}

/** The last numbers, with a note: kept on screen while updating, or after an update failed. */
export function withNote(props: SummaryWidgetProps, note: string): SummaryWidgetProps {
  return props.kind === 'data' ? { ...props, note } : props;
}
