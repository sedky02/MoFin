import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '@/api/client';
import { getSessionState, onSessionEnd } from '@/api/session';
import { summaryApiCurrency } from '@/core/dashboard-scope';
import type { Account, DailySeries, Goal, LedgerBalance, MonthlySummary, Paginated, User } from '@/core/types';
import { deviceTimeZone, localIso } from '@/core/week';
import { goalsProps, signedOutGoals, type GoalsWidgetProps } from '@/widgets/goals-data';
import { GoalsHomeWidget } from '@/widgets/goals-widget';
import {
  amountsHidden,
  noAccountsSummary,
  NOTES,
  PERIOD_OF,
  periodRange,
  resolveScope,
  scopeBalance,
  scopeCurrency,
  signedOutSummary,
  sumDays,
  summaryProps,
  withNote,
  type SummaryWidgetName,
  type SummaryWidgetProps,
} from '@/widgets/summary-data';
import { MonthlySummaryWidget, WeeklySummaryWidget } from '@/widgets/summary-widgets';
import { loadWidgetSettings } from '@/widgets/widget-settings';

// Widgets can't fetch, so the app pushes their props (updateSnapshot) on start, foreground, a
// change that can move the numbers, widget setup and ↻. Other changes show at the next push.

/** Why a sync was asked for. */
export type SyncReason = 'start' | 'foreground' | 'change' | 'settings' | 'refresh';

export type WidgetsProps = {
  WeeklySummary: SummaryWidgetProps;
  MonthlySummary: SummaryWidgetProps;
  Goals: GoalsWidgetProps;
};

export const FOREGROUND_MIN_MS = 60_000;
export const REFRESH_DEBOUNCE_MS = 5_000;
const LAST_KEY = 'mofin-widgets-shown';
const LIST_LIMIT = 100;

const WIDGETS = {
  WeeklySummary: WeeklySummaryWidget,
  MonthlySummary: MonthlySummaryWidget,
  Goals: GoalsHomeWidget,
};
const SUMMARIES: SummaryWidgetName[] = ['WeeklySummary', 'MonthlySummary'];
const HAS_WIDGETS = Object.values(WIDGETS).some(Boolean);

let inflight: Promise<void> | undefined;
/** A change arrived while a sync was running: run once more after it, with the newest data. */
let again = false;
let lastSuccess = 0;
let lastRefreshTap = -Infinity;
/** What the widgets show now (also stored, to keep it after a failed update on a cold start). */
let shown: WidgetsProps | undefined;

function draw(props: WidgetsProps): void {
  WIDGETS.WeeklySummary?.updateSnapshot(props.WeeklySummary);
  WIDGETS.MonthlySummary?.updateSnapshot(props.MonthlySummary);
  WIDGETS.Goals?.updateSnapshot(props.Goals);
}

function push(props: WidgetsProps): void {
  shown = props;
  draw(props);
  AsyncStorage.setItem(LAST_KEY, JSON.stringify(props)).catch(() => {});
}

function signedOut(): WidgetsProps {
  return { WeeklySummary: signedOutSummary('week'), MonthlySummary: signedOutSummary('month'), Goals: signedOutGoals() };
}

function noted(props: WidgetsProps, note: string): WidgetsProps {
  return {
    WeeklySummary: withNote(props.WeeklySummary, note),
    MonthlySummary: withNote(props.MonthlySummary, note),
    Goals: withNote(props.Goals, note),
  };
}

async function lastShown(): Promise<WidgetsProps | undefined> {
  if (shown) return shown;
  try {
    const raw = await AsyncStorage.getItem(LAST_KEY);
    shown = raw ? (JSON.parse(raw) as WidgetsProps) : undefined;
  } catch {
    shown = undefined;
  }
  return shown;
}

export async function computeWidgets(at: Date): Promise<WidgetsProps> {
  const settings = await loadWidgetSettings();
  const [user, accountPage, balances, goalPage] = await Promise.all([
    api.get<User>('/users/me'),
    api.get<Paginated<Account>>('/accounts', { status: 'active', limit: LIST_LIMIT, offset: 0 }),
    api.get<LedgerBalance[]>('/ledger/balance'),
    api.get<Paginated<Goal>>('/goals', { status: 'active', limit: LIST_LIMIT, offset: 0 }),
  ]);
  const accounts = accountPage.data;
  const today = localIso(at);

  async function summary(name: SummaryWidgetName): Promise<SummaryWidgetProps> {
    const period = PERIOD_OF[name];
    if (!accounts.length) return noAccountsSummary(period);
    const { account, missing } = resolveScope(settings[name], accounts);
    const currency = scopeCurrency(account, balances, user, accounts);
    const range = periodRange(period, today);
    let flows: { income: string; expenses: string };
    if (period === 'month') {
      const month = await api.get<MonthlySummary>('/analytics/monthly-summary', {
        year: range.year,
        month: range.month,
        accountId: account?.id,
        currency: summaryApiCurrency(account?.id, currency),
      });
      flows = { income: month.income, expenses: month.expenses };
    } else {
      const week = await api.get<DailySeries>('/analytics/daily-series', {
        currency,
        from: range.from,
        days: range.days,
        tz: deviceTimeZone(),
        accountId: account?.id,
      });
      flows = sumDays(week.points);
    }
    return summaryProps({
      period,
      accounts,
      account,
      missing,
      currency,
      balance: scopeBalance(balances, account, currency, accounts),
      ...flows,
      hidden: amountsHidden(settings.hideAmounts, account),
      at,
    });
  }

  const [weekly, monthly] = await Promise.all(SUMMARIES.map(summary));
  return {
    WeeklySummary: weekly!,
    MonthlySummary: monthly!,
    Goals: goalsProps({ goals: goalPage.data, chosenIds: settings.Goals.goalIds, at }),
  };
}

async function run(reason: SyncReason): Promise<void> {
  if (getSessionState().status !== 'signedIn') {
    push(signedOut());
    return;
  }
  const before = await lastShown();
  // A tap on ↻: the widgets say they are updating, over the numbers they have (not stored).
  if (reason === 'refresh' && before) draw(noted(before, NOTES.updating));
  try {
    push(await computeWidgets(new Date()));
    lastSuccess = Date.now();
  } catch {
    // A session that ended meanwhile has already set the widgets (see installWidgetSync).
    if (getSessionState().status !== 'signedIn') return;
    // Offline or a server error: keep the last numbers and their time, and say the update failed.
    if (before) push(noted(before, NOTES.failed));
  }
}

/**
 * Asks for the widgets to be updated. Runs one sync at a time: a change during a sync runs one more
 * after it; a foreground return soon after a sync, or a second ↻ tap, is dropped.
 */
export function requestWidgetSync(reason: SyncReason, now = Date.now()): Promise<void> {
  if (!HAS_WIDGETS) return Promise.resolve();
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
  if (installed || !HAS_WIDGETS) return;
  installed = true;
  onSessionEnd((reason) => {
    if (reason === 'signed_out') {
      shown = undefined;
      draw(signedOut());
      AsyncStorage.removeItem(LAST_KEY).catch(() => {});
      return;
    }
    void lastShown().then((props) => {
      if (props) push(noted(props, NOTES.signIn));
    });
  });
}

export function resetWidgetSyncForTests(): void {
  inflight = undefined;
  again = false;
  lastSuccess = 0;
  lastRefreshTap = -Infinity;
  shown = undefined;
}
