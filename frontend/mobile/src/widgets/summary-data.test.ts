import type { Account, DailySeriesPoint, LedgerBalance, User } from '@/core/types';
import {
  ALL_ACCOUNTS,
  amountsHidden,
  maskedAmount,
  noAccountsSummary,
  NOTES,
  periodRange,
  resolveScope,
  scopeBalance,
  scopeCurrency,
  sumDays,
  summaryProps,
  updatedLabel,
  withNote,
} from '@/widgets/summary-data';

const account = (id: string, currency = 'TND', over: Partial<Account> = {}): Account => ({
  id,
  name: id === 'cash' ? 'Cash' : id === 'bank' ? 'Bank' : 'Euro card',
  type: 'CASH' as Account['type'],
  currency,
  createdAt: '',
  updatedAt: '',
  ...over,
});
const CASH = account('cash');
const BANK = account('bank');
const EURO = account('euro', 'EUR');
const ACCOUNTS = [CASH, BANK, EURO];

// All-accounts balance rows: "<accountId>:<currency>".
const BALANCES: LedgerBalance[] = [
  { key: 'cash:TND', balance: '120.500' },
  { key: 'bank:TND', balance: '1000.250' },
  { key: 'euro:EUR', balance: '40.00' },
];
const USER = { id: 'u1', email: 'a@b.c', settings: { defaultCurrency: 'TND' }, createdAt: '', updatedAt: '' } as User;

describe('periodRange', () => {
  it('covers the calendar month that holds today', () => {
    expect(periodRange('month', '2026-11-06')).toEqual({ year: 2026, month: 11, from: '2026-11-01', days: 30 });
    expect(periodRange('month', '2028-02-29')).toEqual({ year: 2028, month: 2, from: '2028-02-01', days: 29 });
  });

  it('covers Monday to Sunday of the week that holds today', () => {
    // 6 Nov 2026 is a Friday.
    expect(periodRange('week', '2026-11-06')).toMatchObject({ from: '2026-11-02', days: 7 });
    // A Sunday belongs to the week that started six days earlier.
    expect(periodRange('week', '2026-11-08')).toMatchObject({ from: '2026-11-02', days: 7 });
    // A Monday starts its own week, even across a month end.
    expect(periodRange('week', '2026-12-28')).toMatchObject({ from: '2026-12-28' });
    expect(periodRange('week', '2027-01-01')).toMatchObject({ from: '2026-12-28', year: 2027, month: 1 });
  });
});

describe('resolveScope', () => {
  it('covers all accounts, or the chosen one', () => {
    expect(resolveScope({ accountId: ALL_ACCOUNTS }, ACCOUNTS)).toEqual({ missing: false });
    expect(resolveScope({ accountId: 'bank' }, ACCOUNTS)).toEqual({ account: BANK, missing: false });
  });

  it('falls back to all accounts, and says so, when the chosen account is gone or archived', () => {
    expect(resolveScope({ accountId: 'deleted' }, ACCOUNTS)).toEqual({ missing: true });
  });
});

describe('scopeCurrency and scopeBalance', () => {
  it("uses one account's own currency and balance", () => {
    expect(scopeCurrency(EURO, BALANCES, USER, ACCOUNTS)).toBe('EUR');
    expect(scopeBalance(BALANCES, EURO, 'EUR')).toBe('40');
    expect(scopeBalance(BALANCES, CASH, 'TND')).toBe('120.5');
  });

  it('sums all accounts in the main currency only, never across currencies', () => {
    expect(scopeCurrency(undefined, BALANCES, USER, ACCOUNTS)).toBe('TND');
    expect(scopeBalance(BALANCES, undefined, 'TND')).toBe('1120.75');
  });

  it('sums the all-accounts rows as the server sends them, private accounts already left out', () => {
    expect(scopeBalance(BALANCES.filter((b) => !b.key.startsWith('bank:')), undefined, 'TND')).toBe('120.5');
  });

  it('is zero for an account with no ledger rows yet', () => {
    expect(scopeBalance([], BANK, 'TND')).toBe('0');
  });
});

describe('sumDays', () => {
  const day = (date: string, income: string, expenses: string): DailySeriesPoint => ({ date, income, expenses, balance: '0' });

  it("adds a week's days exactly, future days counting zero", () => {
    expect(
      sumDays([day('2026-11-02', '0.1', '10.005'), day('2026-11-03', '0.2', '0'), day('2026-11-08', '0', '0')]),
    ).toEqual({ income: '0.3', expenses: '10.005' });
    expect(sumDays([])).toEqual({ income: '0', expenses: '0' });
  });
});

describe('masking', () => {
  it('hides every widget amount, or those of an account the user hid', () => {
    expect(amountsHidden(true, undefined)).toBe(true);
    expect(amountsHidden(false, account('x', 'TND', { metadata: { visibility: 'masked' } }))).toBe(true);
    expect(amountsHidden(false, account('x', 'TND', { metadata: { visibility: 'yes' } }))).toBe(false);
    expect(amountsHidden(false, undefined)).toBe(false);
    expect(maskedAmount('TND')).toBe('•••• TND');
  });
});

describe('updatedLabel', () => {
  it('always carries the date, so an old update never reads as today', () => {
    const label = updatedLabel(new Date(2026, 10, 6, 14, 32), 'en-GB');
    expect(label).toContain('6 Nov');
    expect(label).toContain('14:32');
  });
});

describe('summaryProps', () => {
  const base = {
    period: 'month' as const,
    accounts: ACCOUNTS,
    account: undefined,
    missing: false,
    currency: 'TND',
    balance: '1120.75',
    income: '2500',
    expenses: '830.125',
    hidden: false,
    at: new Date(2026, 10, 6, 9, 5),
    locale: 'en-GB',
  };

  it('formats the numbers for the scope and period', () => {
    const props = summaryProps(base);
    expect(props).toMatchObject({ kind: 'data', title: 'This month', scope: 'All accounts', note: '' });
    expect(props.balance).toContain('1,120.750');
    expect(props.expenses).toContain('830.125');
    expect(props.openUrl).toBe('mofin://dashboard');
    expect(props.refreshUrl).toBe('mofin://refresh?to=dashboard');
  });

  it('names a single account and the week, and opens the dashboard', () => {
    const props = summaryProps({ ...base, period: 'week', account: BANK });
    expect(props).toMatchObject({ title: 'This week', scope: 'Bank' });
  });

  it('says when hidden accounts are left out of all accounts', () => {
    const accounts = [CASH, account('bank', 'TND', { metadata: { visibility: 'private' } }), EURO];
    expect(summaryProps({ ...base, accounts }).scope).toBe('All accounts · excl. hidden');
    expect(summaryProps({ ...base, accounts, currency: 'EUR' }).scope).toBe('All accounts');
  });

  it('masks every amount when hidden', () => {
    const props = summaryProps({ ...base, hidden: true });
    expect([props.balance, props.income, props.expenses]).toEqual(['•••• TND', '•••• TND', '•••• TND']);
  });

  it('notes a configured account that is gone', () => {
    expect(summaryProps({ ...base, missing: true }).note).toBe(NOTES.accountGone);
  });

  it('asks for an account when there are none', () => {
    expect(summaryProps({ ...base, accounts: [] })).toEqual(noAccountsSummary('month'));
  });

  it('keeps the numbers and their time when a note is added', () => {
    const props = summaryProps(base);
    expect(withNote(props, NOTES.failed)).toEqual({ ...props, note: NOTES.failed });
    const empty = noAccountsSummary('week');
    expect(withNote(empty, NOTES.failed)).toBe(empty);
  });
});
