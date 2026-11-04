import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { api } from '@/api/client';
import { TransactionsScreen } from '@/components/transactions/transactions-screen';
import type { Transaction } from '@/core/types';

import { ACCOUNT, FOOD, leg, makeTx, page, SAVINGS, wrapper } from './test-fixtures';

jest.mock('@/api/client', () => {
  const actual = jest.requireActual('@/api/client');
  return { ...actual, api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } };
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));
jest.mock('@/components/transactions/datetime-field', () => jest.requireActual('./datetime-field.test-double'));

const mockedGet = api.get as jest.Mock;
const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };

const DAY = 24 * 3600 * 1000;
const now = Date.now();
let rows: Transaction[] = [];

function searchCalls() {
  return mockedGet.mock.calls.filter(([path]) => path === '/search/transactions').map(([, params]) => params as Record<string, unknown>);
}

beforeEach(() => {
  router.push.mockClear();
  mockedGet.mockReset();
  rows = [
    makeTx({ id: 't1', description: 'zz-Coffee', occurredAt: new Date(now).toISOString() }),
    makeTx({ id: 't2', description: 'zz-Bagel', occurredAt: new Date(now).toISOString() }),
    makeTx({ id: 't3', description: 'zz-Pay', type: 'INCOME', category: null, categoryId: null, items: [leg({ direction: 'CREDIT', amount: '100.00' })], occurredAt: new Date(now - DAY).toISOString() }),
    makeTx({
      id: 't4',
      description: 'zz-Move',
      type: 'TRANSFER',
      category: null,
      categoryId: null,
      isRecurring: true,
      items: [leg({ id: 'o', direction: 'DEBIT' }), leg({ id: 'i', direction: 'CREDIT', accountId: 'a2', account: SAVINGS })],
      occurredAt: new Date(now - 40 * DAY).toISOString(),
    }),
  ];
  mockedGet.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
    if (path === '/accounts') return page([ACCOUNT, SAVINGS]);
    if (path === '/categories') return page([FOOD]);
    if (path === '/search/transactions') {
      if (params?.recurrence === 'series') return page([]);
      return page(rows, { total: 60 });
    }
    throw new Error(`unexpected GET ${path}`);
  });
});

describe('TransactionsScreen', () => {
  it('groups rows under Today and Yesterday headings and names the accounts', async () => {
    await render(<TransactionsScreen />, { wrapper });
    expect(await screen.findByText('zz-Coffee')).toBeTruthy();
    const headings = screen.getAllByRole('heading').filter((h) => h.props['aria-level'] === 2).map((h) => h.props.children);
    expect(headings.slice(0, 2)).toEqual(['Today', 'Yesterday']);
    expect(headings).toHaveLength(3);
    // Two rows share Today's heading; the transfer reads "From → To" and carries the recurring mark.
    expect(screen.getByLabelText(/^zz-Move, Everyday → Savings, recurring$/)).toBeTruthy();
    expect(screen.getByText('Showing 4 of 60')).toBeTruthy();
  });

  it('opens a transaction from its row', async () => {
    await render(<TransactionsScreen />, { wrapper });
    await fireEvent.press(await screen.findByLabelText(/^zz-Coffee,/));
    expect(router.push).toHaveBeenCalledWith('/transactions/t1');
  });

  it('sends the sheet filters, shows chips and clears them', async () => {
    await render(<TransactionsScreen />, { wrapper });
    await screen.findByText('zz-Coffee');
    await fireEvent.press(screen.getByLabelText('More filters'));
    await fireEvent.press(await screen.findByLabelText(/^Type:/));
    await fireEvent.press(await screen.findByLabelText('Income'));
    await fireEvent.changeText(screen.getByLabelText('Min amount'), '5');
    await fireEvent.press(screen.getByLabelText('Done'));

    expect(await screen.findByLabelText('Remove filter: Income')).toBeTruthy();
    expect(screen.getByLabelText('Remove filter: At least 5')).toBeTruthy();
    await waitFor(() => expect(searchCalls().at(-1)).toMatchObject({ type: 'INCOME', minAmount: '5', limit: 25, offset: 0 }));

    await fireEvent.press(screen.getByLabelText('Remove filter: Income'));
    await waitFor(() => expect(searchCalls().at(-1)?.type).toBeUndefined());
    await fireEvent.press(screen.getByLabelText('Clear all'));
    await waitFor(() => expect(screen.queryByLabelText('Remove filter: At least 5')).toBeNull());
  });

  it('loads the next batch after what is shown and says how much is loaded', async () => {
    const more = [makeTx({ id: 't5', description: 'zz-Lunch', occurredAt: new Date(now).toISOString() })];
    mockedGet.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/search/transactions') return page([ACCOUNT]);
      // The second batch repeats t1 (as offset paging can) and adds t5.
      return params?.offset === 4 ? page([rows[0], ...more], { total: 60, offset: 4 }) : page(rows, { total: 60 });
    });
    await render(<TransactionsScreen />, { wrapper });
    await screen.findByText('zz-Coffee');
    expect(screen.getByText('Showing 4 of 60')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Load more transactions'));
    await waitFor(() => expect(searchCalls().at(-1)).toMatchObject({ offset: 4, limit: 25 }));
    expect(await screen.findByText('zz-Lunch')).toBeTruthy();
    expect(screen.getAllByText('zz-Coffee')).toHaveLength(1);
    expect(screen.getByText('Showing 5 of 60')).toBeTruthy();
  });

  it('says when everything is loaded and offers no more', async () => {
    mockedGet.mockImplementation(async (path: string) => (path === '/search/transactions' ? page(rows, { total: 4 }) : page([ACCOUNT])));
    await render(<TransactionsScreen />, { wrapper });
    expect(await screen.findByText('All 4 transactions')).toBeTruthy();
    expect(screen.queryByLabelText('Load more transactions')).toBeNull();
  });

  it('shows the no-match state with a way out, and starts from the top on a filter change', async () => {
    await render(<TransactionsScreen />, { wrapper });
    await screen.findByText('zz-Coffee');
    await fireEvent.press(screen.getByLabelText('Load more transactions'));
    await waitFor(() => expect(searchCalls().at(-1)).toMatchObject({ offset: 4 }));

    mockedGet.mockImplementation(async (path: string) => (path === '/search/transactions' ? page([]) : page([ACCOUNT])));
    await fireEvent.press(screen.getByLabelText('More filters'));
    await fireEvent.press(await screen.findByLabelText(/^Type:/));
    await fireEvent.press(await screen.findByLabelText('Expense'));
    await fireEvent.press(screen.getByLabelText('Done'));
    expect(await screen.findByText('No transactions match')).toBeTruthy();
    expect(searchCalls().at(-1)).toMatchObject({ type: 'EXPENSE', offset: 0 });
  });

  it('shows the plain empty state without filters', async () => {
    mockedGet.mockImplementation(async (path: string) => (path === '/search/transactions' ? page([]) : page([])));
    await render(<TransactionsScreen />, { wrapper });
    expect(await screen.findByText('No transactions yet')).toBeTruthy();
  });

  it('switches to the recurring series', async () => {
    const root = makeTx({ id: 'r1', description: 'zz-Rent', isRecurring: true, recurringStatus: 'ACTIVE', recurringInterval: 'MONTHLY', recurringAmount: '500.00', nextOccurrenceAt: new Date(now + DAY).toISOString() });
    mockedGet.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path === '/search/transactions') return params?.recurrence === 'series' ? page([root]) : page(rows);
      return page([ACCOUNT]);
    });
    await render(<TransactionsScreen />, { wrapper });
    await act(async () => {});
    await fireEvent.press(await screen.findByRole('radio', { name: 'Recurring' }));
    expect(await screen.findByText('zz-Rent')).toBeTruthy();
    expect(screen.getByLabelText('Pause series')).toBeTruthy();
    expect(screen.getByLabelText('Edit series')).toBeTruthy();
  });
});
