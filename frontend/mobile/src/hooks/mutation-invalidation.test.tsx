import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { api } from '@/api/client';
import { ApiClientError } from '@/api/http';
import { accountKeys, aiChatKeys, analyticsKeys, categoryKeys, draftKeys, goalKeys, ledgerKeys, searchKeys, transactionKeys } from '@/core/query-keys';
import { useArchiveAccount, useCreateAccount, useUpdateAccount } from '@/hooks/useAccounts';
import { useArchiveCategory, useCreateCategory } from '@/hooks/useCategories';
import { useApproveDraft, useRejectDraft } from '@/hooks/useDrafts';
import { useSendChatMessage } from '@/hooks/useAiChat';
import { useCreateTransaction, useDeleteTransaction, useUpdateTransaction, UNDO_DELETE_MS } from '@/hooks/useTransactions';
import { getToasts, resetToasts } from '@/lib/toast';

// The approve toast's "View" link navigates; the router itself isn't needed here.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/api/client', () => {
  const actual = jest.requireActual('@/api/client');
  return { ...actual, api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } };
});

const MONEY_ROOTS = [transactionKeys.all, ledgerKeys.all, analyticsKeys.all, searchKeys.all, goalKeys.all];
const BALANCE_ROOTS = [accountKeys.all, ledgerKeys.all, analyticsKeys.all, goalKeys.all];

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const spy = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const invalidated = () => spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
  return { client, wrapper, invalidated };
}

const expectRoots = (invalidated: string[], roots: readonly (readonly string[])[]) => {
  for (const root of roots) expect(invalidated).toContain(JSON.stringify(root));
};

beforeEach(() => {
  jest.clearAllMocks();
  resetToasts();
});

describe('transaction mutations refresh every money view', () => {
  it('create invalidates lists, balances, analytics, search and goals, and offers Undo', async () => {
    const { wrapper, invalidated } = setup();
    (api.post as jest.Mock).mockResolvedValue({ id: 't1' });
    const { result } = await renderHook(() => useCreateTransaction(), { wrapper });
    await act(async () => result.current.mutate({ type: 'EXPENSE', description: 'x', amount: '1', currency: 'USD', occurredAt: '2026-01-01T00:00:00Z' }));
    await waitFor(() => expectRoots(invalidated(), MONEY_ROOTS));
    expect(api.post).toHaveBeenCalledWith('/transactions', expect.objectContaining({ amount: '1' }));
    const toast = getToasts()[0];
    expect(toast.message).toBe('Transaction recorded.');
    expect(toast.action?.label).toBe('Undo');
  });

  it('Undo after a create soft-deletes it and refreshes the money views again', async () => {
    const { wrapper, invalidated } = setup();
    (api.post as jest.Mock).mockResolvedValue({ id: 't9' });
    (api.delete as jest.Mock).mockResolvedValue(undefined);
    const onUndone = jest.fn();
    const { result } = await renderHook(() => useCreateTransaction({ onUndone }), { wrapper });
    await act(async () => result.current.mutate({ type: 'EXPENSE', description: 'x', amount: '1', currency: 'USD', occurredAt: '2026-01-01T00:00:00Z' }));
    await waitFor(() => expect(getToasts()).toHaveLength(1));
    const before = invalidated().length;
    await act(async () => getToasts()[0].action?.onClick());
    await waitFor(() => expect(onUndone).toHaveBeenCalledWith('t9'));
    expect(api.delete).toHaveBeenCalledWith('/transactions/t9');
    expect(invalidated().length).toBeGreaterThan(before);
  });

  it('a failed create shows the server message and refreshes nothing', async () => {
    const { wrapper, invalidated } = setup();
    (api.post as jest.Mock).mockRejectedValue(new ApiClientError(400, 'Amount too large'));
    const { result } = await renderHook(() => useCreateTransaction(), { wrapper });
    await act(async () => result.current.mutate({ type: 'EXPENSE', description: 'x', amount: '1', currency: 'USD', occurredAt: 'x' }));
    await waitFor(() => expect(getToasts()[0]?.message).toBe('Amount too large'));
    expect(invalidated()).toHaveLength(0);
  });

  it('edit and delete refresh the same views; delete offers Undo that restores', async () => {
    const { wrapper, invalidated } = setup();
    (api.patch as jest.Mock).mockResolvedValue({ id: 't1' });
    (api.delete as jest.Mock).mockResolvedValue(undefined);
    (api.post as jest.Mock).mockResolvedValue({ id: 't1' });
    const edit = await renderHook(() => useUpdateTransaction('t1'), { wrapper });
    await act(async () => edit.result.current.mutate({ type: 'EXPENSE', description: 'y', amount: '2', currency: 'USD', occurredAt: 'x' }));
    await waitFor(() => expectRoots(invalidated(), MONEY_ROOTS));

    const onUndone = jest.fn();
    const del = await renderHook(() => useDeleteTransaction({ onUndone }), { wrapper });
    await act(async () => del.result.current.mutate('t1'));
    await waitFor(() => expect(getToasts().some((t) => t.message === 'Transaction deleted.')).toBe(true));
    const toast = getToasts().find((t) => t.message === 'Transaction deleted.')!;
    expect(toast.duration).toBe(UNDO_DELETE_MS);
    await act(async () => toast.action?.onClick());
    await waitFor(() => expect(onUndone).toHaveBeenCalledWith('t1'));
    expect(api.post).toHaveBeenCalledWith('/transactions/t1/restore');
  });

  it('a failed Undo does not call onUndone and reports the failure', async () => {
    const { wrapper } = setup();
    (api.delete as jest.Mock).mockResolvedValue(undefined);
    (api.post as jest.Mock).mockRejectedValue(new ApiClientError(404, 'Transaction not found'));
    const onUndone = jest.fn();
    const del = await renderHook(() => useDeleteTransaction({ onUndone }), { wrapper });
    await act(async () => del.result.current.mutate('t1'));
    await waitFor(() => expect(getToasts()).toHaveLength(1));
    await act(async () => getToasts()[0].action?.onClick());
    await waitFor(() => expect(getToasts().some((t) => t.kind === 'error')).toBe(true));
    expect(onUndone).not.toHaveBeenCalled();
  });
});

describe('account mutations refresh balances', () => {
  it('create and update invalidate accounts, ledger, analytics and goals', async () => {
    const { wrapper, invalidated } = setup();
    (api.post as jest.Mock).mockResolvedValue({ id: 'a1' });
    (api.patch as jest.Mock).mockResolvedValue({ id: 'a1' });
    const create = await renderHook(() => useCreateAccount(), { wrapper });
    await act(async () => create.result.current.mutate({ name: 'Cash', type: 'CASH', currency: 'TND', openingBalance: '10.500' }));
    await waitFor(() => expectRoots(invalidated(), BALANCE_ROOTS));
    expect(api.post).toHaveBeenCalledWith('/accounts', expect.objectContaining({ openingBalance: '10.500' }));
    const update = await renderHook(() => useUpdateAccount(), { wrapper });
    await act(async () => update.result.current.mutate({ id: 'a1', openingBalance: '20' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/accounts/a1', { openingBalance: '20' }));
  });

  it('a failed archive puts the optimistically removed account back', async () => {
    const { client, wrapper } = setup();
    const accounts = [{ id: 'a1' }, { id: 'a2' }];
    client.setQueryData(accountKeys.list('active'), accounts);
    (api.delete as jest.Mock).mockRejectedValue(new ApiClientError(500, 'boom'));
    const { result } = await renderHook(() => useArchiveAccount(), { wrapper });
    await act(async () => result.current.mutate('a1'));
    await waitFor(() => expect(getToasts().some((t) => t.kind === 'error')).toBe(true));
    expect(client.getQueryData(accountKeys.list('active'))).toEqual(accounts);
  });
});

describe('category mutations', () => {
  it('create refreshes categories; a 409 duplicate name is left to the dialog (no toast)', async () => {
    const { wrapper, invalidated } = setup();
    (api.post as jest.Mock).mockResolvedValueOnce({ id: 'c1' }).mockRejectedValueOnce(new ApiClientError(409, 'Name taken'));
    const { result } = await renderHook(() => useCreateCategory(), { wrapper });
    await act(async () => result.current.mutate({ name: 'Food', type: 'EXPENSE' }));
    await waitFor(() => expect(invalidated()).toContain(JSON.stringify(categoryKeys.all)));
    resetToasts();
    await act(async () => result.current.mutate({ name: 'Food', type: 'EXPENSE' }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getToasts()).toHaveLength(0);
  });

  it('archive removes the tile only after the server confirms, and Undo restores it', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(categoryKeys.list('active'), [{ id: 'c1', name: 'Food' }, { id: 'c2', name: 'Rent' }]);
    (api.patch as jest.Mock).mockResolvedValue({ id: 'c1', name: 'Food' });
    const { result } = await renderHook(() => useArchiveCategory(), { wrapper });
    await act(async () => result.current.mutate('c1'));
    await waitFor(() => expect(getToasts()[0]?.message).toBe('"Food" archived.'));
    expect(api.patch).toHaveBeenCalledWith('/categories/c1/archive');
    await act(async () => getToasts()[0].action?.onClick());
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/categories/c1/restore'));
  });
});

// The chat's draft cards and the Drafts inbox read the same drafts: a decision in either refreshes both.
describe('draft decisions refresh the inbox and the chat', () => {
  const DRAFT_VIEWS = [draftKeys.all, aiChatKeys.all];

  it('approve refreshes drafts, chats and the money views', async () => {
    const { wrapper, invalidated } = setup();
    (api.patch as jest.Mock).mockResolvedValue({ draft: { id: 'd1' }, transaction: { id: 't1' } });
    const { result } = await renderHook(() => useApproveDraft(), { wrapper });
    await act(async () => result.current.mutate({ id: 'd1' }));
    await waitFor(() => expectRoots(invalidated(), [...DRAFT_VIEWS, transactionKeys.all, ledgerKeys.all]));
    expect(api.patch).toHaveBeenCalledWith('/draft-transactions/d1/approve', undefined);
  });

  it('reject refreshes drafts and chats', async () => {
    const { wrapper, invalidated } = setup();
    (api.patch as jest.Mock).mockResolvedValue({ id: 'd1', status: 'REJECTED' });
    const { result } = await renderHook(() => useRejectDraft(), { wrapper });
    await act(async () => result.current.mutate({ id: 'd1', reason: 'duplicate' }));
    await waitFor(() => expectRoots(invalidated(), DRAFT_VIEWS));
  });

  it('a draft already handled elsewhere refreshes both, so the card shows its real status', async () => {
    const { wrapper, invalidated } = setup();
    (api.patch as jest.Mock).mockRejectedValue(new ApiClientError(400, 'Draft is already approved', undefined));
    const { result } = await renderHook(() => useRejectDraft(), { wrapper });
    await act(async () => result.current.mutate({ id: 'd1' }));
    await waitFor(() => expectRoots(invalidated(), DRAFT_VIEWS));
  });
});

describe('an Ask answer that creates a draft', () => {
  it('refreshes the inbox and its pending badge', async () => {
    const { wrapper, invalidated } = setup();
    const message = (role: string, drafts: unknown[]) => ({ id: role, role, content: 'x', usedTools: [], charts: [], drafts, createdAt: '' });
    (api.post as jest.Mock).mockResolvedValue({
      chat: { id: 'c1', title: 't', createdAt: '', updatedAt: '' },
      messages: [message('user', []), message('assistant', [{ id: 'd1', status: 'PENDING' }])],
    });
    const { result } = await renderHook(() => useSendChatMessage(), { wrapper });
    await act(async () => result.current.mutate({ chatId: null, content: 'coffee 4.5', inputMode: 'voice' }));
    await waitFor(() => expectRoots(invalidated(), [draftKeys.all, aiChatKeys.list()]));
    expect(api.post).toHaveBeenCalledWith('/ai/chats', expect.objectContaining({ content: 'coffee 4.5', inputMode: 'voice' }), expect.anything());
  });
});
