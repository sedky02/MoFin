import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { api } from '@/api/client';
import type { Account } from '@/core/types';
import { clearActiveAccount, resetActiveAccountCache, useActiveAccount } from '@/hooks/useActiveAccount';
import { resetStoredFlagCache, useStoredFlag } from '@/hooks/useStoredFlag';

jest.mock('@/api/client', () => {
  const actual = jest.requireActual('@/api/client');
  return { ...actual, api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } };
});

const mockedGet = api.get as jest.Mock;

beforeEach(async () => {
  await AsyncStorage.clear();
  resetStoredFlagCache();
  resetActiveAccountCache();
  mockedGet.mockReset();
});

describe('useStoredFlag', () => {
  it('reads as set while loading, then reflects an unset flag', async () => {
    const { result } = await renderHook(() => useStoredFlag('welcome'));
    await waitFor(() => expect(result.current[0]).toBe(false));
  });

  it('reads a flag stored earlier', async () => {
    await AsyncStorage.setItem('seen', '1');
    const { result } = await renderHook(() => useStoredFlag('seen'));
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith('seen'));
    expect(result.current[0]).toBe(true);
  });

  it('keeps a flag set while the stored value is still being read', async () => {
    let release: (v: string | null) => void = () => {};
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => new Promise((r) => (release = r)));
    const { result } = await renderHook(() => useStoredFlag('race'));
    await act(async () => result.current[1]());
    await act(async () => release(null)); // the old value (unset) arrives after the set
    expect(result.current[0]).toBe(true);
  });

  it('sets the flag in memory and in storage', async () => {
    const { result } = await renderHook(() => useStoredFlag('tip'));
    await waitFor(() => expect(result.current[0]).toBe(false));
    await act(async () => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(await AsyncStorage.getItem('tip')).toBe('1');
  });
});

const account = (id: string, name: string): Account =>
  ({ id, name, currency: 'USD', type: 'CHECKING', archivedAt: null }) as unknown as Account;

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe('useActiveAccount', () => {
  beforeEach(() => {
    mockedGet.mockImplementation(async (path: string) => {
      if (path === '/accounts') return { data: [account('a1', 'Main'), account('a2', 'Savings')] };
      if (path === '/users/me') return { id: 'u1', settings: { mainAccountId: 'a1' } };
      throw new Error(`unexpected ${path}`);
    });
  });

  it('falls back to the main account when nothing was picked', async () => {
    const { result } = await renderHook(() => useActiveAccount(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.accountId).toBe('a1'));
  });

  it('restores the stored pick, and is not ready until it has been read', async () => {
    let release: () => void = () => {};
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(
      () => new Promise((r) => (release = () => r('a2'))),
    );
    const { result } = await renderHook(() => useActiveAccount(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.accounts.length).toBe(2)); // accounts known, pick still unread
    expect(result.current.ready).toBe(false);
    expect(result.current.accountId).toBe('a1'); // the main-account fallback
    await act(async () => release());
    await waitFor(() => expect(result.current.accountId).toBe('a2'));
    expect(result.current.ready).toBe(true);
  });

  it('remembers "All accounts" as an explicit choice instead of falling back to main', async () => {
    const { result } = await renderHook(() => useActiveAccount(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.accountId).toBe('a1'));
    await act(async () => result.current.setAccountId(undefined));
    expect(result.current.accountId).toBeUndefined();
    expect(await AsyncStorage.getItem('mofin-active-account')).toBe('all');
  });

  it('forgets the pick when asked (sign-out), in memory and on disk', async () => {
    await AsyncStorage.setItem('mofin-active-account', 'all');
    const { result } = await renderHook(() => useActiveAccount(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.accountId).toBeUndefined();
    await act(async () => clearActiveAccount());
    expect(await AsyncStorage.getItem('mofin-active-account')).toBeNull();
    await waitFor(() => expect(result.current.accountId).toBe('a1')); // main account again
  });

  it('ignores a stored id that is no longer an account', async () => {
    await AsyncStorage.setItem('mofin-active-account', 'gone');
    const { result } = await renderHook(() => useActiveAccount(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.accountId).toBe('a1'));
  });
});
