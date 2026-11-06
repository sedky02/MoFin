import AsyncStorage from '@react-native-async-storage/async-storage';

import { NOTES } from '@/widgets/summary-data';
import { DEFAULT_WIDGET_SETTINGS, setWidgetSettings } from '@/widgets/widget-settings';
import {
  installWidgetSync,
  REFRESH_DEBOUNCE_MS,
  requestWidgetSync,
  resetWidgetSyncForTests,
} from '@/widgets/widget-sync';

// The three Android widgets, faked: tests only see what the app pushes to each.
const mockPushed: Record<string, unknown[]> = { WeeklySummary: [], MonthlySummary: [], Goals: [] };
// A function declaration: hoisted, so the mock factories below can use it before this line runs.
function mockWidget(name: string) {
  return { updateSnapshot: (p: unknown) => mockPushed[name]!.push(p) };
}
jest.mock('@/widgets/summary-widgets', () => ({
  WeeklySummaryWidget: mockWidget('WeeklySummary'),
  MonthlySummaryWidget: mockWidget('MonthlySummary'),
}));
jest.mock('@/widgets/goals-widget', () => ({ GoalsHomeWidget: mockWidget('Goals') }));

const mockGet = jest.fn();
jest.mock('@/api/client', () => ({ api: { get: (...a: unknown[]) => mockGet(...a) } }));

let mockStatus = 'signedIn';
const mockEndListeners: ((reason: string) => void)[] = [];
jest.mock('@/api/session', () => ({
  getSessionState: () => ({ status: mockStatus }),
  onSessionEnd: (l: (reason: string) => void) => {
    mockEndListeners.push(l);
    return () => {};
  },
}));

const ACCOUNTS = [
  { id: 'cash', name: 'Cash', type: 'CASH', currency: 'TND', createdAt: '', updatedAt: '' },
  { id: 'bank', name: 'Bank', type: 'BANK', currency: 'TND', createdAt: '', updatedAt: '' },
];
const GOAL = {
  id: 'g1',
  accountId: 'bank',
  name: 'Holiday',
  type: 'BALANCE',
  targetAmount: '1000',
  isRecurring: false,
  periodStart: '2026-01-01',
  createdAt: '',
  updatedAt: '',
  currentInstance: null,
};

function serve(over: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    '/users/me': { id: 'u1', email: 'a@b.c', settings: { defaultCurrency: 'TND' } },
    '/accounts': { data: ACCOUNTS, total: 2, limit: 100, offset: 0 },
    '/ledger/balance': [
      { key: 'cash:TND', balance: '20' },
      { key: 'bank:TND', balance: '80' },
    ],
    '/goals': { data: [GOAL], total: 1, limit: 100, offset: 0 },
    '/analytics/monthly-summary': { income: '500', expenses: '120.5', categoryBreakdown: [] },
    '/analytics/daily-series': {
      currency: 'TND',
      timeZone: 'UTC',
      points: [
        { date: '2026-11-02', income: '10', expenses: '3', balance: '0' },
        { date: '2026-11-03', income: '5', expenses: '4', balance: '0' },
      ],
    },
    ...over,
  };
  mockGet.mockImplementation(async (path: string) => {
    const r = responses[path];
    if (r instanceof Error) throw r;
    return r;
  });
}

type Shown = { kind: string; title?: string; scope?: string; balance?: string; income?: string; note: string; message: string };
const last = (name: string) => mockPushed[name]!.at(-1) as Shown;
const meCalls = () => mockGet.mock.calls.filter(([p]) => p === '/users/me').length;

beforeEach(async () => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockPushed)) mockPushed[k] = [];
  resetWidgetSyncForTests();
  mockStatus = 'signedIn';
  await AsyncStorage.clear();
  setWidgetSettings(DEFAULT_WIDGET_SETTINGS);
  serve();
});

describe('requestWidgetSync', () => {
  it('fills every widget from one round of shared requests', async () => {
    await requestWidgetSync('start');
    expect(meCalls()).toBe(1);
    expect(last('WeeklySummary')).toMatchObject({ kind: 'data', title: 'This week', scope: 'All accounts' });
    expect(last('MonthlySummary')).toMatchObject({ kind: 'data', title: 'This month', scope: 'All accounts' });
    expect(last('MonthlySummary').balance).toContain('100');
    // No goals chosen yet: the Goals widget asks for them.
    expect(last('Goals')).toMatchObject({ kind: 'message' });
    expect(last('Goals').message).toMatch(/choose/);
  });

  it("uses each widget's own account, and the week's days for the weekly one", async () => {
    setWidgetSettings({ ...DEFAULT_WIDGET_SETTINGS, WeeklySummary: { accountId: 'bank' }, Goals: { goalIds: ['g1'] } });
    await requestWidgetSync('settings');
    expect(mockGet).toHaveBeenCalledWith('/analytics/daily-series', expect.objectContaining({ days: 7, accountId: 'bank' }));
    expect(mockGet).toHaveBeenCalledWith('/analytics/monthly-summary', expect.objectContaining({ accountId: undefined }));
    expect(last('WeeklySummary')).toMatchObject({ scope: 'Bank' });
    expect(last('WeeklySummary').income).toContain('15');
    expect(last('Goals')).toMatchObject({ kind: 'data' });
  });

  it('masks summary amounts when the user hides them in widgets', async () => {
    setWidgetSettings({ ...DEFAULT_WIDGET_SETTINGS, hideAmounts: true });
    await requestWidgetSync('settings');
    expect(last('WeeklySummary').balance).toBe('•••• TND');
    expect(last('MonthlySummary').balance).toBe('•••• TND');
  });

  it("keeps the last numbers and says it couldn't update when a request fails", async () => {
    await requestWidgetSync('start');
    const good = last('MonthlySummary');
    serve({ '/ledger/balance': new Error('offline') });
    await requestWidgetSync('change');
    expect(last('MonthlySummary')).toEqual({ ...good, note: NOTES.failed });
  });

  it('shows "Updating…" over the last numbers while a ↻ refresh runs', async () => {
    await requestWidgetSync('start');
    const before = mockPushed.WeeklySummary!.length;
    await requestWidgetSync('refresh', Date.now());
    expect((mockPushed.WeeklySummary![before] as Shown).note).toBe(NOTES.updating);
    expect(last('WeeklySummary').note).toBe('');
  });

  it('counts ↻ taps close together as one refresh', async () => {
    const now = Date.now();
    await Promise.all([requestWidgetSync('refresh', now), requestWidgetSync('refresh', now + 1000)]);
    await requestWidgetSync('refresh', now + 2000);
    expect(meCalls()).toBe(1);
    await requestWidgetSync('refresh', now + REFRESH_DEBOUNCE_MS + 1);
    expect(meCalls()).toBe(2);
  });

  it('runs once more when a change lands during a sync', async () => {
    await Promise.all([requestWidgetSync('start'), requestWidgetSync('change')]);
    expect(meCalls()).toBe(2);
  });

  it('skips a foreground return right after a sync', async () => {
    await requestWidgetSync('start');
    await requestWidgetSync('foreground');
    expect(meCalls()).toBe(1);
  });

  it('shows the sign-in message on every widget when signed out', async () => {
    mockStatus = 'signedOut';
    await requestWidgetSync('start');
    for (const name of ['WeeklySummary', 'MonthlySummary', 'Goals']) expect(last(name).message).toMatch(/sign in/);
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('installWidgetSync', () => {
  beforeAll(() => installWidgetSync());

  it('clears every widget at once on sign-out', async () => {
    await requestWidgetSync('start');
    mockEndListeners.forEach((l) => l('signed_out'));
    for (const name of ['WeeklySummary', 'MonthlySummary', 'Goals']) expect(last(name).message).toMatch(/sign in/);
    expect(await AsyncStorage.getItem('mofin-widgets-shown')).toBeNull();
  });

  it('keeps the numbers but asks to sign in when the session expired', async () => {
    await requestWidgetSync('start');
    const good = last('WeeklySummary');
    mockEndListeners.forEach((l) => l('expired'));
    await new Promise((r) => setTimeout(r, 0));
    expect(last('WeeklySummary')).toEqual({ ...good, note: NOTES.signIn });
  });
});
