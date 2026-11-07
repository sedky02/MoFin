// The home screen widgets' numbers and words, worked out in the app: widgets can't fetch or compute
// anything themselves, so they get finished strings. Pure functions, tested in summary-data.test.ts.
import { excludedFromTotals, isAmountHidden, MASKED_AMOUNT } from '@/core/account-privacy';
import { totalsByCurrency } from '@/core/balances';
import { add } from '@/core/decimal';
import { scopeBalances } from '@/core/dashboard-scope';
import { formatMoney, pickPrimaryCurrency } from '@/core/format';
import type { Account, DailySeriesPoint, LedgerBalance, User } from '@/core/types';
import { mondayOf } from '@/core/week';

export type SummaryWidgetName = 'WeeklySummary' | 'MonthlySummary';
export type WidgetName = SummaryWidgetName | 'Goals';
export const WIDGET_NAMES: readonly WidgetName[] = ['WeeklySummary', 'MonthlySummary', 'Goals'];

export function isWidgetName(value: unknown): value is WidgetName {
  return typeof value === 'string' && (WIDGET_NAMES as readonly string[]).includes(value);
}

export type WidgetPeriod = 'month' | 'week';
export const PERIOD_OF: Record<SummaryWidgetName, WidgetPeriod> = { WeeklySummary: 'week', MonthlySummary: 'month' };

export const ALL_ACCOUNTS = 'all';

export type SummaryConfig = { accountId: string };
export const DEFAULT_SUMMARY_CONFIG: SummaryConfig = { accountId: ALL_ACCOUNTS };

export const WIDGET_LINKS = {
  dashboard: 'mofin://dashboard',
  goals: 'mofin://goals',
  refreshDashboard: 'mofin://refresh?to=dashboard',
  refreshGoals: 'mofin://refresh?to=goals',
  setup: (widget: WidgetName) => `mofin://widget-setup?widget=${widget}`,
} as const;

/**
 * Every value is display-ready: the widget only lays it out. `data` has the numbers, `message`
 * means nothing to show (signed out, no accounts, nothing loaded).
 */
export type SummaryWidgetProps = {
  kind: 'data' | 'message';
  title: string;
  scope: string;
  balance: string;
  income: string;
  expenses: string;
  updated: string;
  note: string;
  message: string;
  openUrl: string;
  refreshUrl: string;
};

export const NOTES = {
  updating: 'Updating…',
  failed: "Couldn't update",
  signIn: 'Sign in to update',
  accountGone: 'Account removed · showing all',
} as const;

export function periodTitle(period: WidgetPeriod): string {
  return period === 'week' ? 'This week' : 'This month';
}

function emptySummary(period: WidgetPeriod, message: string): SummaryWidgetProps {
  return {
    kind: 'message',
    title: periodTitle(period),
    scope: '',
    balance: '',
    income: '',
    expenses: '',
    updated: '',
    note: '',
    message,
    openUrl: WIDGET_LINKS.dashboard,
    refreshUrl: WIDGET_LINKS.refreshDashboard,
  };
}

export const signedOutSummary = (period: WidgetPeriod) => emptySummary(period, 'Open MoFin to sign in.');
export const noAccountsSummary = (period: WidgetPeriod) => emptySummary(period, 'Add an account in MoFin to see it here.');

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
 * The account a widget covers. An account that is gone or archived falls back to all accounts,
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

/**
 * Today's balance for the scope, in `currency`, from the all-accounts balance rows. The server
 * already leaves private and hidden accounts out of those rows.
 */
export function scopeBalance(
  all: LedgerBalance[],
  account: Account | undefined,
  currency: string,
): string {
  const rows = account ? scopeBalances(all, account.id) : all;
  return totalsByCurrency(rows).find((t) => t.currency === currency)?.amount ?? '0';
}

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

export function amountsHidden(hideInWidgets: boolean, account: Account | undefined): boolean {
  return hideInWidgets || isAmountHidden(account);
}

/**
 * "6 Nov, 14:32", shown beside the refresh arrow. Always with the date: the widget can't redraw the
 * words by itself, so "14:32" alone would read as today's on the next day.
 */
export function updatedLabel(at: Date, locale?: string): string {
  const when = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
  return when;
}

export function summaryProps(input: {
  period: WidgetPeriod;
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
  if (!input.accounts.length) return noAccountsSummary(input.period);
  const money = (amount: string) => (hidden ? maskedAmount(currency) : formatMoney(amount, currency));
  const hiddenLeftOut = !account && excludedFromTotals(input.accounts, currency).length > 0;
  return {
    ...emptySummary(input.period, ''),
    kind: 'data',
    scope: account ? account.name : hiddenLeftOut ? 'All accounts · excl. hidden' : 'All accounts',
    balance: money(input.balance),
    income: money(input.income),
    expenses: money(input.expenses),
    updated: updatedLabel(input.at, input.locale),
    note: input.missing ? NOTES.accountGone : '',
  };
}

/** The last numbers, with a note: kept on screen while updating, or after an update failed. */
export function withNote<P extends { kind: 'data' | 'message'; note: string }>(props: P, note: string): P {
  return props.kind === 'data' ? { ...props, note } : props;
}
