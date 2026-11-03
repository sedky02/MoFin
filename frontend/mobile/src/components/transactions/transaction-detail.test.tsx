import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { api, ApiClientError } from '@/api/client';
import { TransactionDetail } from '@/components/transactions/transaction-detail';
import type { Transaction } from '@/core/types';
import { getToasts, resetToasts } from '@/lib/toast';

import { ACCOUNT, leg, makeTx, page, SAVINGS, FOOD, wrapper } from './test-fixtures';

jest.mock('@/api/client', () => {
  const actual = jest.requireActual('@/api/client');
  return { ...actual, api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } };
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  Stack: { Screen: () => null },
}));
jest.mock('@/components/transactions/datetime-field', () => jest.requireActual('./datetime-field.test-double'));

const mockedGet = api.get as jest.Mock;
const mockedPost = api.post as jest.Mock;
const mockedPatch = api.patch as jest.Mock;
const mockedDelete = api.delete as jest.Mock;
const { router } = jest.requireMock('expo-router') as { router: Record<'push' | 'back' | 'replace' | 'canGoBack', jest.Mock> };

let tx: Transaction | undefined;

beforeEach(() => {
  resetToasts();
  Object.values(router).forEach((m) => m.mockClear());
  router.canGoBack.mockReturnValue(true);
  [mockedGet, mockedPost, mockedPatch, mockedDelete].forEach((m) => m.mockReset());
  tx = makeTx();
  mockedGet.mockImplementation(async (path: string) => {
    if (path.startsWith('/transactions/')) {
      if (!tx) throw new ApiClientError(404, 'Not found');
      return tx;
    }
    if (path === '/accounts') return page([ACCOUNT, SAVINGS]);
    if (path === '/categories') return page([FOOD]);
    throw new Error(`unexpected GET ${path}`);
  });
});

describe('TransactionDetail', () => {
  it('shows the fields of an expense and opens the edit route', async () => {
    await render(<TransactionDetail id="t1" />, { wrapper });
    expect(await screen.findByText('zz-Coffee')).toBeTruthy();
    expect(screen.getByText('Expense')).toBeTruthy();
    expect(screen.getAllByText('Everyday').length).toBeGreaterThan(0);
    expect(screen.getByText('Food')).toBeTruthy();
    expect(screen.getAllByLabelText('$12.50').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByLabelText('Edit'));
    expect(router.push).toHaveBeenCalledWith('/transactions/t1/edit');
  });

  it('shows both sides of a transfer', async () => {
    tx = makeTx({
      type: 'TRANSFER',
      category: null,
      items: [leg({ id: 'o', direction: 'DEBIT' }), leg({ id: 'i', direction: 'CREDIT', accountId: 'a2', account: SAVINGS })],
    });
    await render(<TransactionDetail id="t1" />, { wrapper });
    expect(await screen.findByText('From')).toBeTruthy();
    expect(screen.getByText('To')).toBeTruthy();
    expect(screen.getAllByText('Savings').length).toBeGreaterThan(0);
  });

  it('lists split lines with their categories', async () => {
    tx = makeTx({
      category: null,
      items: [leg({ id: 's1', direction: 'DEBIT', amount: '5.00', category: FOOD, categoryId: FOOD.id }), leg({ id: 's2', direction: 'DEBIT', amount: '7.50', memo: 'bag' })],
    });
    await render(<TransactionDetail id="t1" />, { wrapper });
    expect(await screen.findByText('Food')).toBeTruthy();
    expect(screen.getByText('Uncategorized')).toBeTruthy();
    expect(screen.getByText('bag')).toBeTruthy();
  });

  it('deletes after a confirmation, goes back, and Undo restores and returns', async () => {
    mockedDelete.mockResolvedValue(undefined);
    mockedPost.mockResolvedValue(makeTx());
    await render(<TransactionDetail id="t1" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Delete'));
    expect(await screen.findByText('Delete this transaction?')).toBeTruthy();
    expect(mockedDelete).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Delete transaction'));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('/transactions/t1'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const toast = getToasts().find((t) => t.message === 'Transaction deleted.')!;
    expect(toast.action?.label).toBe('Undo');

    toast.action!.onClick();
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/transactions/t1/restore'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/transactions/t1'));
    expect(getToasts().map((t) => t.message)).toContain('Transaction restored.');
  });

  it('leaves to the list when there is nowhere to go back to', async () => {
    router.canGoBack.mockReturnValue(false);
    mockedDelete.mockResolvedValue(undefined);
    await render(<TransactionDetail id="t1" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Delete'));
    await fireEvent.press(await screen.findByText('Delete transaction'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/transactions'));
  });

  it('warns that deleting a series root stops the series', async () => {
    tx = makeTx({ isRecurring: true, recurringStatus: 'ACTIVE', recurringInterval: 'MONTHLY' });
    await render(<TransactionDetail id="t1" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Delete'));
    expect(await screen.findByText(/the recurring series stops/)).toBeTruthy();
  });

  it('shows the not-found state for a 404 (e.g. after Undo of a create) and goes back from it', async () => {
    tx = undefined;
    await render(<TransactionDetail id="gone" />, { wrapper });
    expect(await screen.findByText('Transaction not found')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back to transactions'));
    expect(router.back).toHaveBeenCalled();
  });

  it('offers a retry, not "not found", for other failures', async () => {
    mockedGet.mockImplementation(async () => {
      throw new ApiClientError(500, 'boom');
    });
    await render(<TransactionDetail id="t1" />, { wrapper });
    expect(await screen.findByText("Couldn't load this transaction.")).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('links an occurrence back to its series', async () => {
    tx = makeTx({ parentTransactionId: 'root' });
    await render(<TransactionDetail id="t1" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Generated from a recurring series'));
    expect(router.push).toHaveBeenCalledWith('/transactions/root');
    expect(screen.queryByLabelText('Pause series')).toBeNull();
  });
});

describe('recurring controls on a series root', () => {
  const root = (over: Partial<Transaction>) =>
    makeTx({ isRecurring: true, recurringInterval: 'MONTHLY', recurringAmount: '12.50', recurringFromAccountId: 'a1', nextOccurrenceAt: '2030-01-05T00:00:00.000Z', ...over });

  it('an active series can be edited, paused or cancelled, and shows its next date', async () => {
    tx = root({ recurringStatus: 'ACTIVE' });
    mockedPost.mockResolvedValue(tx);
    await render(<TransactionDetail id="t1" />, { wrapper });
    expect(await screen.findByLabelText('Edit series')).toBeTruthy();
    expect(screen.getByText(/Next on /)).toBeTruthy();
    expect(screen.queryByLabelText('Resume series')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Pause series'));
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/transactions/t1/recurring/pause'));
  });

  it('a paused series offers Resume instead of Pause and says why it is paused', async () => {
    tx = root({ recurringStatus: 'PAUSED', recurringError: 'Account is archived' });
    mockedPost.mockResolvedValue(tx);
    await render(<TransactionDetail id="t1" />, { wrapper });
    expect(await screen.findByText('Paused: Account is archived')).toBeTruthy();
    expect(screen.queryByLabelText('Pause series')).toBeNull();
    expect(screen.queryByText(/Next on /)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Resume series'));
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/transactions/t1/recurring/resume'));
  });

  it('cancelling asks first, then cancels', async () => {
    tx = root({ recurringStatus: 'ACTIVE' });
    mockedPost.mockResolvedValue(tx);
    await render(<TransactionDetail id="t1" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Cancel series'));
    expect(await screen.findByText('Cancel recurring transaction?')).toBeTruthy();
    expect(mockedPost).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Keep it'));
    expect(mockedPost).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Cancel series'));
    await fireEvent.press((await screen.findAllByText('Cancel series')).at(-1)!);
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/transactions/t1/recurring/cancel'));
  });

  it('a cancelled series has no actions', async () => {
    tx = root({ recurringStatus: 'CANCELLED' });
    await render(<TransactionDetail id="t1" />, { wrapper });
    expect(await screen.findByText('Monthly · Cancelled')).toBeTruthy();
    expect(screen.queryByLabelText('Edit series')).toBeNull();
    expect(screen.queryByLabelText('Pause series')).toBeNull();
  });

  it('editing sends only the changed fields', async () => {
    tx = root({ recurringStatus: 'ACTIVE' });
    mockedPatch.mockResolvedValue(tx);
    await render(<TransactionDetail id="t1" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Edit series'));
    await fireEvent.changeText(await screen.findByLabelText('Description'), 'zz-Rent v2');
    await fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() => expect(mockedPatch).toHaveBeenCalledWith('/transactions/t1/recurring', { description: 'zz-Rent v2' }));
  });

  it('editing blocks an empty description', async () => {
    tx = root({ recurringStatus: 'ACTIVE' });
    await render(<TransactionDetail id="t1" />, { wrapper });
    await fireEvent.press(await screen.findByLabelText('Edit series'));
    await fireEvent.changeText(await screen.findByLabelText('Description'), '');
    await fireEvent.press(screen.getByLabelText('Save changes'));
    expect(await screen.findByText('Add a short description.')).toBeTruthy();
    expect(mockedPatch).not.toHaveBeenCalled();
  });
});
