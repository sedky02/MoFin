import { renderHook } from '@testing-library/react-native';

import { useAssistantNudge, useSetup } from '@/hooks/useSetup';

const mock = {
  skipped: false,
  user: { isDemo: false, createdAt: new Date().toISOString() } as Record<string, unknown> | undefined,
  accounts: undefined as unknown[] | undefined,
  transactions: undefined as unknown[] | undefined,
  apps: undefined as unknown[] | undefined,
  recentEnabled: undefined as boolean | undefined,
};
const mockSkip = jest.fn();

jest.mock('@/hooks/useStoredFlag', () => ({ useStoredFlag: () => [mock.skipped, mockSkip] }));
jest.mock('@/hooks/useUser', () => ({ useUser: () => ({ data: mock.user }) }));
jest.mock('@/hooks/useAccounts', () => ({ useAccounts: () => ({ data: mock.accounts }) }));
jest.mock('@/hooks/useSearch', () => ({
  useRecentTransactions: (_l: number, _a: unknown, enabled: boolean) => {
    mock.recentEnabled = enabled;
    return { data: enabled ? mock.transactions : undefined };
  },
}));
jest.mock('@/hooks/useConnectedApps', () => ({ useConnectedApps: () => ({ data: mock.apps }) }));

const acct = { id: 'a1', name: 'Main', currency: 'USD' };

beforeEach(() => {
  mock.skipped = false;
  mock.user = { isDemo: false, createdAt: new Date().toISOString() };
  mock.accounts = undefined;
  mock.transactions = undefined;
  mock.apps = undefined;
});

describe('useSetup', () => {
  it('is off while accounts load', async () => {
    const { result } = await renderHook(() => useSetup());
    expect(result.current).toEqual({ status: 'off' });
  });
  it('starts at the account step with no account, without asking for transactions', async () => {
    mock.accounts = [];
    const { result } = await renderHook(() => useSetup());
    expect(result.current).toMatchObject({ status: 'step', step: 'account', accounts: [] });
    expect(mock.recentEnabled).toBe(false);
  });
  it('waits (loading) once there is an account until transactions are known', async () => {
    mock.accounts = [acct];
    const { result } = await renderHook(() => useSetup());
    expect(result.current).toEqual({ status: 'loading' });
  });
  it('moves to the transaction step with an account and nothing recorded', async () => {
    mock.accounts = [acct];
    mock.transactions = [];
    const { result } = await renderHook(() => useSetup());
    expect(result.current).toMatchObject({ status: 'step', step: 'transaction' });
    if (result.current.status === 'step') expect(result.current.skip).toBe(mockSkip);
  });
  it('is over once a transaction exists', async () => {
    mock.accounts = [acct];
    mock.transactions = [{ id: 't1' }];
    const { result } = await renderHook(() => useSetup());
    expect(result.current).toEqual({ status: 'off' });
  });
  it('is over when the transaction step was skipped', async () => {
    mock.accounts = [acct];
    mock.skipped = true;
    const { result } = await renderHook(() => useSetup());
    expect(result.current).toEqual({ status: 'off' });
  });
  it('never shows for a demo user', async () => {
    mock.accounts = [];
    mock.user = { isDemo: true };
    const { result } = await renderHook(() => useSetup());
    expect(result.current).toEqual({ status: 'off' });
  });
});

describe('useAssistantNudge', () => {
  it('shows for a recent user with no connected apps once setup is over', async () => {
    mock.apps = [];
    const { result } = await renderHook(() => useAssistantNudge(true));
    expect(result.current.show).toBe(true);
  });
  it('stays hidden while setup is running, with a connected app, or for an old account', async () => {
    mock.apps = [];
    expect((await renderHook(() => useAssistantNudge(false))).result.current.show).toBe(false);
    mock.apps = [{ id: 'x' }];
    expect((await renderHook(() => useAssistantNudge(true))).result.current.show).toBe(false);
    mock.apps = [];
    mock.user = { isDemo: false, createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString() };
    expect((await renderHook(() => useAssistantNudge(true))).result.current.show).toBe(false);
  });
});
