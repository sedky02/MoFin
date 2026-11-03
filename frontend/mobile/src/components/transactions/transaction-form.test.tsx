import AsyncStorage from '@react-native-async-storage/async-storage';
import { PortalHost } from '@rn-primitives/portal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { api, ApiClientError } from '@/api/client';
import { TransactionForm } from '@/components/transactions/transaction-form';
import type { Account, Category, Transaction, User } from '@/core/types';
import { resetActiveAccountCache } from '@/hooks/useActiveAccount';
import { getToasts, resetToasts } from '@/lib/toast';

jest.mock('@/api/client', () => {
  const actual = jest.requireActual('@/api/client');
  return { ...actual, api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } };
});

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));

// The native picker needs native code; a text field with the same value contract stands in.
jest.mock('@/components/transactions/datetime-field', () => jest.requireActual('./datetime-field.test-double'));

const mockedGet = api.get as jest.Mock;
const mockedPost = api.post as jest.Mock;
const mockedPatch = api.patch as jest.Mock;

const account = (id: string, name: string, currency: string): Account =>
  ({ id, name, type: 'BANK', currency, createdAt: '', updatedAt: '' }) as Account;
const USD = account('a1', 'Everyday', 'USD');
const EUR = account('a2', 'Euro wallet', 'EUR');
const USD2 = account('a3', 'Savings', 'USD');
const TND = account('a4', 'Tunis', 'TND');
const JPY = account('a5', 'Tokyo', 'JPY');

const categories: Category[] = [
  { id: 'c-food', name: 'Food', type: 'EXPENSE', isSystem: false },
  { id: 'c-rent', name: 'Rent', type: 'EXPENSE', isSystem: false },
  { id: 'c-salary', name: 'Salary', type: 'INCOME', isSystem: false },
];

const page = <T,>(data: T[]) => ({ data, total: data.length, limit: 100, offset: 0 });

let accounts: Account[] = [USD, EUR, USD2];
let user: User = { id: 'u1', email: 'u@x.test', settings: {}, createdAt: '', updatedAt: '' };
let savedTx: Transaction | undefined;
let createdCategories: Category[] = [];

const NOW = '2026-11-03T14:05';

beforeEach(async () => {
  await AsyncStorage.clear();
  resetActiveAccountCache();
  resetToasts();
  accounts = [USD, EUR, USD2];
  user = { id: 'u1', email: 'u@x.test', settings: {}, createdAt: '', updatedAt: '' };
  savedTx = undefined;
  createdCategories = [];
  mockedGet.mockReset();
  mockedPost.mockReset();
  mockedPatch.mockReset();
  mockedGet.mockImplementation(async (path: string) => {
    if (path === '/accounts') return page(accounts);
    if (path === '/categories') return page([...categories, ...createdCategories]);
    if (path === '/users/me') return user;
    if (path === '/search/transactions') return page([]);
    if (path.startsWith('/transactions/')) {
      if (!savedTx) throw new ApiClientError(404, 'Not found');
      return savedTx;
    }
    throw new Error(`unexpected GET ${path}`);
  });
  mockedPost.mockImplementation(async (path: string, body: { type: string; name?: string }) => {
    if (path === '/categories') {
      const c = { id: 'c-new', isSystem: false, ...body } as Category;
      createdCategories.push(c);
      return c;
    }
    return { id: 'new-tx', ...body };
  });
  mockedPatch.mockImplementation(async (_path: string, body: object) => ({ ...savedTx, ...body }));
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  return (
    <QueryClientProvider client={client}>
      {children}
      <PortalHost />
    </QueryClientProvider>
  );
}

async function renderForm(props: React.ComponentProps<typeof TransactionForm> = {}) {
  const onSaved = jest.fn();
  await render(<TransactionForm defaults={{ occurredAt: NOW }} onSaved={onSaved} {...props} />, { wrapper });
  await screen.findByText('Save transaction', {}, { timeout: 3000 }).catch(() => screen.findByText('Save changes'));
  return { onSaved };
}

async function pickAccount(field: RegExp, option: string) {
  await fireEvent.press(screen.getByLabelText(field));
  await fireEvent.press(await screen.findByLabelText(option));
}

const save = () => fireEvent.press(screen.getByText(/Save (transaction|changes)/));

describe('TransactionForm: create', () => {
  it('sends an expense in the same shape as the web', async () => {
    const { onSaved } = await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Amount in USD'), '12.5');
    await fireEvent.changeText(screen.getByLabelText('Description'), 'zz-Coffee');
    await fireEvent.press(await screen.findByLabelText('Food'));
    await save();

    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1));
    expect(mockedPost).toHaveBeenCalledWith('/transactions', {
      type: 'EXPENSE',
      description: 'zz-Coffee',
      amount: '12.5',
      currency: 'USD',
      occurredAt: new Date(NOW).toISOString(),
      fromAccountId: 'a1',
      toAccountId: undefined,
      categoryId: 'c-food',
      items: undefined,
      isRecurring: undefined,
      recurringInterval: undefined,
      recurringEndDate: undefined,
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-tx' })));
  });

  it('offers Undo and View in the "recorded" toast', async () => {
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Amount in USD'), '3');
    await fireEvent.changeText(screen.getByLabelText('Description'), 'zz-Tea');
    await save();
    await waitFor(() => expect(getToasts().map((t) => t.message)).toContain('Transaction recorded.'));
    const t = getToasts().find((x) => x.message === 'Transaction recorded.')!;
    expect(t.action?.label).toBe('Undo');
    expect(t.cancel?.label).toBe('View');
  });

  it('shows the web validation messages and sends nothing', async () => {
    await renderForm();
    await save();
    expect(await screen.findByText('Enter an amount greater than 0.')).toBeTruthy();
    expect(screen.getByText('Add a short description.')).toBeTruthy();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('sends income to the receiving account', async () => {
    await renderForm();
    await fireEvent.press(screen.getByLabelText('Income'));
    await fireEvent.changeText(screen.getByLabelText('Amount in USD'), '2000');
    await fireEvent.changeText(screen.getByLabelText('Description'), 'zz-Salary');
    await fireEvent.press(await screen.findByLabelText('Salary'));
    await save();
    await waitFor(() => expect(mockedPost).toHaveBeenCalled());
    expect(mockedPost.mock.calls[0][1]).toMatchObject({
      type: 'INCOME',
      amount: '2000',
      toAccountId: 'a1',
      fromAccountId: undefined,
      categoryId: 'c-salary',
    });
  });
});

describe('TransactionForm: new category', () => {
  it('creates a category from the "New" chip and picks it', async () => {
    await renderForm();
    await fireEvent.press(await screen.findByLabelText('New category'));
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'zz-Snacks');
    await fireEvent.press(screen.getByText('Create category'));
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/categories', expect.objectContaining({ name: 'zz-Snacks', type: 'EXPENSE' })));
    expect(await screen.findByRole('radio', { name: 'zz-Snacks', checked: true })).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Amount in USD'), '4');
    await fireEvent.changeText(screen.getByLabelText('Description'), 'zz-Chips');
    await save();
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/transactions', expect.objectContaining({ categoryId: 'c-new' })));
  });
});

describe('TransactionForm: currency decimals', () => {
  it('tidies TND to 3 decimals and JPY to none', async () => {
    accounts = [TND, JPY];
    await renderForm();
    const tnd = screen.getByLabelText('Amount in TND');
    await fireEvent.changeText(tnd, '12.5');
    await fireEvent(tnd, 'blur');
    expect(screen.getByLabelText('Amount in TND').props.value).toBe('12.500');

    await pickAccount(/^Account: /, 'Tokyo, JPY');
    const jpy = await screen.findByLabelText('Amount in JPY');
    await fireEvent.changeText(jpy, '1200.4');
    await fireEvent(jpy, 'blur');
    expect(screen.getByLabelText('Amount in JPY').props.value).toBe('1200');
  });

  it('rounds a still-focused amount on submit, as blur would', async () => {
    accounts = [TND];
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Amount in TND'), '12.3456');
    await fireEvent.changeText(screen.getByLabelText('Description'), 'zz-Bread');
    await save();
    await waitFor(() => expect(mockedPost).toHaveBeenCalled());
    expect(mockedPost.mock.calls[0][1]).toMatchObject({ amount: '12.346', currency: 'TND' });
  });
});

describe('TransactionForm: transfer', () => {
  it('refuses a transfer between currencies with the web message', async () => {
    await renderForm();
    await fireEvent.press(screen.getByLabelText('Transfer'));
    // The destination defaults to another USD account; pick the EUR one instead.
    expect(screen.getByLabelText('To account: Savings (USD)')).toBeTruthy();
    await pickAccount(/^To account: /, 'Euro wallet, EUR');
    await fireEvent.changeText(screen.getByLabelText('Amount in USD'), '50');
    await fireEvent.changeText(screen.getByLabelText('Description'), 'zz-Move');
    await save();
    expect(await screen.findByText("Cross-currency transfers aren't supported (USD → EUR).")).toBeTruthy();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('sends a same-currency transfer without a category', async () => {
    await renderForm();
    await fireEvent.press(await screen.findByLabelText('Food'));
    await fireEvent.press(screen.getByLabelText('Transfer'));
    await fireEvent.changeText(screen.getByLabelText('Amount in USD'), '50');
    await fireEvent.changeText(screen.getByLabelText('Description'), 'zz-Move');
    await save();
    await waitFor(() => expect(mockedPost).toHaveBeenCalled());
    expect(mockedPost.mock.calls[0][1]).toMatchObject({
      type: 'TRANSFER',
      fromAccountId: 'a1',
      toAccountId: 'a3',
      categoryId: undefined,
      amount: '50',
    });
  });
});

describe('TransactionForm: split lines', () => {
  it('derives the total from the lines and sends them', async () => {
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Amount in USD'), '10');
    await fireEvent.press(await screen.findByLabelText('Food'));
    await fireEvent.press(screen.getByLabelText('Split transaction'));
    expect(screen.getByText('Split into 2 items')).toBeTruthy();
    // Two lines is the minimum: neither can be removed yet.
    expect(screen.getByLabelText('Remove item 1')).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Item 2 amount'), '2.255');
    await fireEvent.changeText(screen.getByLabelText('Item 2 note'), ' tip ');
    await fireEvent.press(screen.getByLabelText('Add item'));
    expect(screen.getByText('Split into 3 items')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Item 3 amount'), '0.1');
    expect(screen.getByText('Total: 12.36 USD')).toBeTruthy();
    expect(screen.getByLabelText('Amount in USD').props.value).toBe('12.36');

    await fireEvent.changeText(screen.getByLabelText('Description'), 'zz-Groceries');
    await save();
    await waitFor(() => expect(mockedPost).toHaveBeenCalled());
    const body = mockedPost.mock.calls[0][1];
    // Each line is tidied to cents first (2.255 -> 2.26), so the lines add up to the total sent.
    expect(body.items).toEqual([
      { amount: '10', categoryId: 'c-food', memo: undefined },
      { amount: '2.26', categoryId: undefined, memo: 'tip' },
      { amount: '0.1', categoryId: undefined, memo: undefined },
    ]);
    expect(body.amount).toBe('12.36');
    expect(body.categoryId).toBeUndefined();
    expect(body.isRecurring).toBeUndefined();
  });

  it('shows the API message when the lines do not add up, and maps line errors', async () => {
    mockedPost.mockRejectedValueOnce(
      new ApiClientError(400, 'Split item amounts must add up to the transaction total'),
    );
    await renderForm();
    await fireEvent.press(screen.getByLabelText('Split transaction'));
    await fireEvent.changeText(screen.getByLabelText('Item 1 amount'), '1');
    await fireEvent.changeText(screen.getByLabelText('Item 2 amount'), '2');
    await fireEvent.changeText(screen.getByLabelText('Description'), 'zz-Split');
    await save();
    await waitFor(() =>
      expect(getToasts().map((t) => t.message)).toContain('Split item amounts must add up to the transaction total'),
    );

    mockedPost.mockRejectedValueOnce(
      new ApiClientError(400, 'Validation failed', {
        statusCode: 400,
        message: 'Validation failed',
        errors: [{ path: 'items.1.amount', message: 'Each split item amount must be greater than zero' }],
      } as never),
    );
    await save();
    expect(await screen.findByText('Each split item amount must be greater than zero')).toBeTruthy();
  });

  it('asks before a transfer throws the lines away', async () => {
    await renderForm();
    await fireEvent.press(screen.getByLabelText('Split transaction'));
    await fireEvent.press(screen.getByLabelText('Transfer'));
    expect(await screen.findByText('Switch to Transfer?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Switch to Transfer'));
    await waitFor(() => expect(screen.queryByText('Split into 2 items')).toBeNull());
    expect(screen.getByLabelText('To account: Savings (USD)')).toBeTruthy();
  });
});

describe('TransactionForm: recurring', () => {
  async function fillRecurring() {
    await fireEvent.changeText(screen.getByLabelText('Amount in USD'), '900');
    await fireEvent.changeText(screen.getByLabelText('Description'), 'zz-Rent');
    await fireEvent.press(screen.getByLabelText('Repeat this transaction'));
  }

  it('needs an interval', async () => {
    await renderForm();
    await fillRecurring();
    await save();
    expect(await screen.findByText('Choose how often this repeats.')).toBeTruthy();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('refuses an end date before the transaction date', async () => {
    await renderForm();
    await fillRecurring();
    await fireEvent.press(screen.getByLabelText('Month'));
    await fireEvent.changeText(screen.getByLabelText('End date'), '2026-11-02');
    await save();
    expect(await screen.findByText('End date must be after the transaction date.')).toBeTruthy();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('accepts an end date on the same local day and sends the end of that day', async () => {
    await renderForm();
    await fillRecurring();
    await fireEvent.press(screen.getByLabelText('Year'));
    await fireEvent.changeText(screen.getByLabelText('End date'), '2026-11-03');
    await save();
    await waitFor(() => expect(mockedPost).toHaveBeenCalled());
    expect(mockedPost.mock.calls[0][1]).toMatchObject({
      isRecurring: true,
      recurringInterval: 'YEARLY',
      recurringEndDate: new Date('2026-11-03T23:59:59').toISOString(),
    });
  });
});

describe('TransactionForm: default account', () => {
  it('waits for the stored active account before it shows a default', async () => {
    user = { ...user, settings: { mainAccountId: 'a1' } };
    await AsyncStorage.setItem('mofin-active-account', 'a2');
    let release: () => void = () => {};
    const getItem = AsyncStorage.getItem as jest.Mock;
    const realGetItem = getItem.getMockImplementation();
    getItem.mockImplementationOnce(
      (key: string) =>
        new Promise((resolve) => {
          release = () => resolve(realGetItem ? realGetItem(key) : null);
        }),
    );

    await render(<TransactionForm defaults={{ occurredAt: NOW }} />, { wrapper });
    // Accounts and user are loaded, but the stored pick isn't: no form, so no main-account default.
    await waitFor(() => expect(mockedGet).toHaveBeenCalledWith('/users/me'));
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('Save transaction')).toBeNull();

    await act(async () => release());
    expect(await screen.findByLabelText('Account: Euro wallet (EUR)')).toBeTruthy();
    expect(screen.getByLabelText('Amount in EUR')).toBeTruthy();
  });

  it('falls back to the main account when nothing is stored', async () => {
    user = { ...user, settings: { mainAccountId: 'a3' } };
    await renderForm();
    expect(screen.getByLabelText('Account: Savings (USD)')).toBeTruthy();
  });

  it('asks for an account first when there is none', async () => {
    accounts = [];
    await render(<TransactionForm />, { wrapper });
    expect(await screen.findByText('Add an account first')).toBeTruthy();
  });
});

describe('TransactionForm: edit', () => {
  const split: Transaction = {
    id: 't1',
    type: 'EXPENSE',
    description: 'zz-Market',
    currency: 'TND',
    occurredAt: '2026-10-20T09:15:00.000Z',
    isRecurring: false,
    createdAt: '',
    updatedAt: 'v1',
    items: [
      { id: 'i1', transactionId: 't1', accountId: 'a4', direction: 'DEBIT', amount: '10.5', currency: 'TND', categoryId: 'c-food', memo: 'Fruit' },
      { id: 'i2', transactionId: 't1', accountId: 'a4', direction: 'DEBIT', amount: '2.125', currency: 'TND', categoryId: null, memo: 'zz-Market' },
    ],
  };

  it('loads the saved values and sends an update without the recurrence', async () => {
    accounts = [TND, USD];
    savedTx = split;
    const { onSaved } = await renderForm({ mode: 'edit', transactionId: 't1', defaults: undefined });
    expect(screen.getByDisplayValue('zz-Market')).toBeTruthy();
    expect(screen.getByLabelText('Amount in TND').props.value).toBe('12.625');
    expect(screen.getByLabelText('Item 1 amount').props.value).toBe('10.500');
    expect(screen.getByLabelText('Item 2 amount').props.value).toBe('2.125');
    expect(screen.getByLabelText('Item 1 note').props.value).toBe('Fruit');
    // A line saved without a note carries the description as its memo; it isn't shown back.
    expect(screen.getByLabelText('Item 2 note').props.value).toBe('');
    expect(screen.getByLabelText('Account: Tunis (TND)')).toBeTruthy();
    expect(screen.queryByLabelText('Repeat this transaction')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Item 2 amount'), '3');
    await save();
    await waitFor(() => expect(mockedPatch).toHaveBeenCalled());
    const [path, body] = mockedPatch.mock.calls[0];
    expect(path).toBe('/transactions/t1');
    expect(body).toEqual({
      type: 'EXPENSE',
      description: 'zz-Market',
      amount: '13.5',
      currency: 'TND',
      occurredAt: '2026-10-20T09:15:00.000Z',
      fromAccountId: 'a4',
      toAccountId: undefined,
      categoryId: undefined,
      items: [
        { amount: '10.5', categoryId: 'c-food', memo: 'Fruit' },
        { amount: '3', categoryId: undefined, memo: undefined },
      ],
    });
    expect(body).not.toHaveProperty('isRecurring');
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('says so when the transaction is gone', async () => {
    await render(<TransactionForm mode="edit" transactionId="missing" />, { wrapper });
    expect(await screen.findByText('Transaction not found')).toBeTruthy();
  });

  it('refuses to edit a transaction on an archived account', async () => {
    savedTx = {
      ...split,
      items: split.items.map((i) => ({ ...i, account: { ...TND, archivedAt: '2026-10-30T00:00:00Z' } })),
    };
    await render(<TransactionForm mode="edit" transactionId="t1" />, { wrapper });
    expect(await screen.findByText('This transaction is on an archived account')).toBeTruthy();
  });
});
