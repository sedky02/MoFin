import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '@/api/client';
import { getSessionState, onSessionEnd } from '@/api/session';
import { summaryApiCurrency } from '@/core/dashboard-scope';
import type { Account, DailySeries, LedgerBalance, MonthlySummary, Paginated, User } from '@/core/types';
import { deviceTimeZone, localIso } from '@/core/week';
import {
  amountsHidden,
  NO_ACCOUNTS_SUMMARY_PROPS,
  NOTES,
  periodRange,
  resolveScope,
  scopeBalance,
  scopeCurrency,
  SIGNED_OUT_SUMMARY_PROPS,
  sumDays,
  summaryProps,
  withNote,
  type SummaryWidgetProps,
} from '@/widgets/summary-data';
import SummaryWidget from '@/widgets/summary-widget';
import { loadWidgetSettings } from '@/widgets/widget-settings';

// Keeps the home screen widgets current. Widgets can't fetch: the app computes their props and
// pushes them (updateSnapshot), when it starts or comes back to the foreground, after a change that
// can move the numbers, and when a widget's ↻ opens the app. Data changed elsewhere (a draft
// approved through MCP, the web app) shows at the next of these.

/** Why a sync was asked for. */
export type SyncReason = 'start' | 'foreground' | 'change' | 'settings' | 'refresh';

/** Coming back to the app more often than this doesn't refetch. */
export const FOREGROUND_MIN_MS = 60_000;
/** Taps on ↻ closer together than this count as one. */
export const REFRESH_DEBOUNCE_MS = 5_000;
const LAST_KEY = 'mofin-widget-summary';
const ACCOUNTS_LIMIT = 100;

let inflight: Promise<void> | undefined;
/** A change arrived while a sync was running: run once more after it, with the newest data. */
let again = false;
let lastSuccess = 0;
let lastRefreshTap = -Infinity;
/** What the Summary widget shows now (also stored, to keep it after a failed update on a cold start). */
let shown: SummaryWidgetProps | undefined;

function push(props: SummaryWidgetProps): void {
  shown = props;
  SummaryWidget?.updateSnapshot(props);
  AsyncStorage.setItem(LAST_KEY, JSON.stringify(props)).catch(() => {});
}

async function lastShown(): Promise<SummaryWidgetProps | undefined> {
  if (shown) return shown;
  try {
    const raw = await AsyncStorage.getItem(LAST_KEY);
    shown = raw ? (JSON.parse(raw) as SummaryWidgetProps) : undefined;
  } catch {
    shown = undefined;
  }
  return shown;
}

/** Fetches what the Summary widget needs and works out its props. Throws when a request fails. */
export async function computeSummary(at: Date): Promise<SummaryWidgetProps> {
  const settings = await loadWidgetSettings();
  const config = settings.summary;
  const [user, page, balances] = await Promise.all([
    api.get<User>('/users/me'),
    api.get<Paginated<Account>>('/accounts', { status: 'active', limit: ACCOUNTS_LIMIT, offset: 0 }),
    api.get<LedgerBalance[]>('/ledger/balance'),
  ]);
  const accounts = page.data;
  if (!accounts.length) return NO_ACCOUNTS_SUMMARY_PROPS;

  const { account, missing } = resolveScope(config, accounts);
  const currency = scopeCurrency(account, balances, user, accounts);
  const range = periodRange(config.period, localIso(at));
  let flows: { income: string; expenses: string };
  if (config.period === 'month') {
    const summary = await api.get<MonthlySummary>('/analytics/monthly-summary', {
      year: range.year,
      month: range.month,
      accountId: account?.id,
      currency: summaryApiCurrency(account?.id, currency),
    });
    flows = { income: summary.income, expenses: summary.expenses };
  } else {
    const series = await api.get<DailySeries>('/analytics/daily-series', {
      currency,
      from: range.from,
      days: range.days,
      tz: deviceTimeZone(),
      accountId: account?.id,
    });
    flows = sumDays(series.points);
  }

  return summaryProps({
    config,
    accounts,
    account,
    missing,
    currency,
    balance: scopeBalance(balances, account, currency),
    ...flows,
    hidden: amountsHidden(settings.hideAmounts, account),
    at,
  });
}

async function run(reason: SyncReason): Promise<void> {
  if (getSessionState().status !== 'signedIn') {
    push(SIGNED_OUT_SUMMARY_PROPS);
    return;
  }
  const before = await lastShown();
  // A tap on ↻: the widget says it is updating, over the numbers it has (not stored).
  if (reason === 'refresh' && before) SummaryWidget?.updateSnapshot(withNote(before, NOTES.updating));
  try {
    push(await computeSummary(new Date()));
    lastSuccess = Date.now();
  } catch {
    // A session that ended meanwhile has already set the widget (see installWidgetSync).
    if (getSessionState().status !== 'signedIn') return;
    // Offline or a server error: keep the last numbers and their time, and say the update failed.
    if (before) push(withNote(before, NOTES.failed));
  }
}

/**
 * Asks for the widgets to be updated. Runs one sync at a time: a change during a sync runs one more
 * after it; a foreground return soon after a sync, or a second ↻ tap, is dropped.
 */
export function requestWidgetSync(reason: SyncReason, now = Date.now()): Promise<void> {
  if (!SummaryWidget) return Promise.resolve();
  if (reason === 'refresh') {
    if (now - lastRefreshTap < REFRESH_DEBOUNCE_MS) return inflight ?? Promise.resolve();
    lastRefreshTap = now;
  }
  if (reason === 'foreground' && now - lastSuccess < FOREGROUND_MIN_MS) return Promise.resolve();
  if (inflight) {
    if (reason === 'change' || reason === 'settings') again = true;
    return inflight;
  }
  inflight = (async () => {
    try {
      await run(reason);
      while (again) {
        again = false;
        await run('change');
      }
    } finally {
      inflight = undefined;
    }
  })();
  return inflight;
}

let installed = false;

/**
 * Signing out clears the widgets at once: nothing financial stays on the home screen. An expired
 * session keeps the last numbers but says to sign in (the app shows the sign-in screen).
 */
export function installWidgetSync(): void {
  if (installed || !SummaryWidget) return;
  installed = true;
  onSessionEnd((reason) => {
    if (reason === 'signed_out') {
      shown = undefined;
      SummaryWidget?.updateSnapshot(SIGNED_OUT_SUMMARY_PROPS);
      AsyncStorage.removeItem(LAST_KEY).catch(() => {});
      return;
    }
    void lastShown().then((props) => {
      if (props) push(withNote(props, NOTES.signIn));
    });
  });
}

/** Test helper: forget timing and what was shown. */
export function resetWidgetSyncForTests(): void {
  inflight = undefined;
  again = false;
  lastSuccess = 0;
  lastRefreshTap = -Infinity;
  shown = undefined;
}
