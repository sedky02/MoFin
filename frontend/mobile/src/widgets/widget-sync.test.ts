import AsyncStorage from '@react-native-async-storage/async-storage';

import { NOTES, SIGNED_OUT_SUMMARY_PROPS, type SummaryWidgetProps } from '@/widgets/summary-data';
import { setWidgetSettings, DEFAULT_WIDGET_SETTINGS } from '@/widgets/widget-settings';
import {
  installWidgetSync,
  REFRESH_DEBOUNCE_MS,
  requestWidgetSync,
  resetWidgetSyncForTests,
} from '@/widgets/widget-sync';

// The Android widget, faked: tests only see what the app pushes to it.
const mockUpdateSnapshot = jest.fn();
jest.mock('@/widgets/summary-widget', () => ({ __esModule: true, default: { updateSnapshot: (p: unknown) => mockUpdateSnapshot(p) } }));

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

function serve(over: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    '/users/me': { id: 'u1', email: 'a@b.c', settings: { defaultCurrency: 'TND' } },
    '/accounts': { data: ACCOUNTS, total: 2, limit: 100, offset: 0 },
    '/ledger/balance': [
      { key: 'cash:TND', balance: '20' },
      { key: 'bank:TND', balance: '80' },
    ],
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

const lastPushed = (): SummaryWidgetProps => mockUpdateSnapshot.mock.calls.at(-1)![0];

beforeEach(async () => {
  jest.clearAllMocks();
  resetWidgetSyncForTests();
  mockStatus = 'signedIn';
  await AsyncStorage.clear();
  setWidgetSettings(DEFAULT_WIDGET_SETTINGS);
  serve();
});

describe('requestWidgetSync', () => {
  it("pushes this month's summary for all accounts, from the same endpoints the dashboard uses", async () => {
    await requestWidgetSync('start');
    expect(mockGet).toHaveBeenCalledWith('/analytics/monthly-summary', expect.objectContaining({ currency: 'TND', accountId: undefined }));
    expect(lastPushed()).toMatchObject({ kind: 'data', title: 'This month', scope: 'All accounts · TND', note: '' });
    expect(lastPushed().balance).toContain('100');
    expect(lastPushed().expenses).toContain('120.5');
  });

  it("sums this week's days for one account", async () => {
    setWidgetSettings({ ...DEFAULT_WIDGET_SETTINGS, summary: { period: 'week', accountId: 'bank' } });
    resetWidgetSyncForTests();
    mockUpdateSnapshot.mockClear();
    await requestWidgetSync('change');
    expect(mockGet).toHaveBeenCalledWith('/analytics/daily-series', expect.objectContaining({ days: 7, accountId: 'bank' }));
    expect(lastPushed()).toMatchObject({ title: 'This week', scope: 'Bank' });
    expect(lastPushed().income).toContain('15');
  });

  it('masks amounts when the user hides them in widgets', async () => {
    setWidgetSettings({ ...DEFAULT_WIDGET_SETTINGS, hideAmounts: true });
    await requestWidgetSync('settings');
    expect(lastPushed().balance).toBe('•••• TND');
  });

  it("keeps the last numbers and says it couldn't update when a request fails", async () => {
    await requestWidgetSync('start');
    const good = lastPushed();
    serve({ '/ledger/balance': new Error('offline') });
    await requestWidgetSync('change');
    expect(lastPushed()).toEqual({ ...good, note: NOTES.failed });
  });

  it('shows "Updating…" over the last numbers while a ↻ refresh runs', async () => {
    await requestWidgetSync('start');
    mockUpdateSnapshot.mockClear();
    await requestWidgetSync('refresh', Date.now());
    expect(mockUpdateSnapshot.mock.calls[0][0].note).toBe(NOTES.updating);
    expect(lastPushed().note).toBe('');
  });

  it('counts ↻ taps close together as one refresh', async () => {
    const now = Date.now();
    await Promise.all([requestWidgetSync('refresh', now), requestWidgetSync('refresh', now + 1000)]);
    await requestWidgetSync('refresh', now + 2000);
    expect(mockGet.mock.calls.filter(([p]) => p === '/users/me')).toHaveLength(1);
    await requestWidgetSync('refresh', now + REFRESH_DEBOUNCE_MS + 1);
    expect(mockGet.mock.calls.filter(([p]) => p === '/users/me')).toHaveLength(2);
  });

  it('runs once more when a change lands during a sync', async () => {
    const first = requestWidgetSync('start');
    const second = requestWidgetSync('change');
    await Promise.all([first, second]);
    expect(mockGet.mock.calls.filter(([p]) => p === '/users/me')).toHaveLength(2);
  });

  it('skips a foreground return right after a sync', async () => {
    await requestWidgetSync('start');
    await requestWidgetSync('foreground');
    expect(mockGet.mock.calls.filter(([p]) => p === '/users/me')).toHaveLength(1);
  });

  it('shows the sign-in message when signed out', async () => {
    mockStatus = 'signedOut';
    await requestWidgetSync('start');
    expect(lastPushed()).toBe(SIGNED_OUT_SUMMARY_PROPS);
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('installWidgetSync', () => {
  beforeAll(() => installWidgetSync());

  it('clears the widget at once on sign-out', async () => {
    await requestWidgetSync('start');
    mockEndListeners.forEach((l) => l('signed_out'));
    expect(lastPushed()).toBe(SIGNED_OUT_SUMMARY_PROPS);
    expect(await AsyncStorage.getItem('mofin-widget-summary')).toBeNull();
  });

  it('keeps the numbers but asks to sign in when the session expired', async () => {
    await requestWidgetSync('start');
    const good = lastPushed();
    mockEndListeners.forEach((l) => l('expired'));
    await new Promise((r) => setTimeout(r, 0));
    expect(lastPushed()).toEqual({ ...good, note: NOTES.signIn });
  });
});
