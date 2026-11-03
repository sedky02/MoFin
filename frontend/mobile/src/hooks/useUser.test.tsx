import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { api } from '@/api/client';
import { userKeys } from '@/core/query-keys';
import type { User } from '@/core/types';
import { useUpdateUser } from '@/hooks/useUser';

jest.mock('@/api/client', () => {
  const actual = jest.requireActual('@/api/client');
  return { ...actual, api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } };
});

describe('useUpdateUser', () => {
  it('merges the partial PATCH /users/me answer into the cached user, so isDemo is not lost', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    client.setQueryData(userKeys.me, { id: 'u1', displayName: 'Demo', isDemo: true } as unknown as User);
    // A refetch that never lands, so only the immediate cache write is observed.
    (api.get as jest.Mock).mockReturnValue(new Promise(() => {}));
    (api.patch as jest.Mock).mockResolvedValue({ id: 'u1', displayName: 'New name' });
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    const { result } = await renderHook(() => useUpdateUser(), { wrapper: Wrapper });
    await act(async () => result.current.mutate({ displayName: 'New name' }));
    await waitFor(() => expect(client.getQueryData<User>(userKeys.me)?.displayName).toBe('New name'));
    expect((client.getQueryData(userKeys.me) as { isDemo?: boolean }).isDemo).toBe(true);
  });
});
