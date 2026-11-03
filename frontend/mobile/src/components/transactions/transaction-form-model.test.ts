import {
  BLANK,
  buildCreateInput,
  buildTransactionFields,
  effectiveAccountIds,
  localDateTimeToDate,
  localDateTimeToIso,
  splitItemsTotal,
  tidyMoneyText,
} from '@/components/transactions/transaction-form-model';
import { parseMoneyInput } from '@/core/format';
import { makeTransactionSchema, type TransactionFormValues } from '@/core/transaction-schema';
import type { Account } from '@/core/types';

const acct = (id: string, currency: string): Account =>
  ({ id, name: id, type: 'BANK', currency, createdAt: '', updatedAt: '' }) as Account;
const usd = acct('usd1', 'USD');
const usd2 = acct('usd2', 'USD');
const eur = acct('eur1', 'EUR');

/**
 * The web form's submit mapping (frontend/web/components/transactions/transaction-form.tsx,
 * `action()`), kept here verbatim so the app's payload is compared against it, not against itself.
 */
function webCreatePayload(v: TransactionFormValues, splitting: boolean, parse: (raw: string) => string | null) {
  const amount = parse(v.amountRaw);
  const splitItems =
    splitting && v.items && v.items.length > 1
      ? v.items.map((item) => ({
          amount: parse(item.amountRaw)!,
          categoryId: item.categoryId || undefined,
          memo: item.description?.trim() || undefined,
        }))
      : undefined;
  return {
    type: v.type,
    description: v.description,
    amount,
    currency: v.currency,
    occurredAt: new Date(v.occurredAt).toISOString(),
    fromAccountId: v.type !== 'INCOME' ? v.fromAccountId : undefined,
    toAccountId: v.type !== 'EXPENSE' ? v.toAccountId : undefined,
    categoryId: v.type !== 'TRANSFER' && !splitItems ? v.categoryId : undefined,
    items: splitItems,
    isRecurring: !splitting && v.isRecurring ? true : undefined,
    recurringInterval: !splitting && v.isRecurring ? v.recurringInterval : undefined,
    recurringEndDate:
      !splitting && v.isRecurring && v.recurringEndDate
        ? new Date(`${v.recurringEndDate}T23:59:59`).toISOString()
        : undefined,
  };
}

describe('localDateTimeToDate', () => {
  it('reads the datetime-local form as local time, like new Date() does on V8', () => {
    for (const s of ['2026-11-03T14:05', '2026-03-29T02:30', '2026-12-31T23:59:59', '2026-01-01']) {
      expect(localDateTimeToDate(s)?.getTime()).toBe(new Date(s.length === 10 ? `${s}T00:00` : s).getTime());
    }
  });

  it('rejects malformed or impossible dates', () => {
    expect(localDateTimeToDate('')).toBeNull();
    expect(localDateTimeToDate('2026-02-31')).toBeNull();
    expect(localDateTimeToDate('03/11/2026')).toBeNull();
  });

  it('gives the ISO string the web sends', () => {
    expect(localDateTimeToIso('2026-11-03T14:05')).toBe(new Date('2026-11-03T14:05').toISOString());
  });
});

describe('tidyMoneyText (the blur tidy, applied on submit)', () => {
  it('rounds to the currency decimals: TND 3, JPY 0, USD 2', () => {
    expect(tidyMoneyText('12.3456', 'TND')).toBe('12.346');
    expect(tidyMoneyText('12.5', 'TND')).toBe('12.500');
    expect(tidyMoneyText('1200.4', 'JPY')).toBe('1200');
    expect(tidyMoneyText('1,234', 'USD')).toBe('1234.00');
    expect(tidyMoneyText('12,5', 'USD')).toBe('12.50');
  });

  it('leaves unreadable text alone so validation can speak to it', () => {
    expect(tidyMoneyText('abc', 'USD')).toBe('abc');
    expect(tidyMoneyText('', 'USD')).toBe('');
  });
});

describe('splitItemsTotal', () => {
  it('adds the lines exactly, with the currency decimals', () => {
    const items = [
      { amountRaw: '0.1', description: '' },
      { amountRaw: '0.2', description: '' },
    ];
    expect(splitItemsTotal(items, 'USD')).toBe('0.30');
    expect(splitItemsTotal(items, 'TND')).toBe('0.300');
    expect(splitItemsTotal([{ amountRaw: '1500', description: '' }, { amountRaw: '25', description: '' }], 'JPY')).toBe(
      '1525',
    );
  });

  it('skips lines that are not amounts yet', () => {
    expect(splitItemsTotal([{ amountRaw: '10' }, { amountRaw: '' }], 'USD')).toBe('10.00');
  });

  it('is the amount the form sends, so the API check "add up to the total" holds', () => {
    const items = [
      { amountRaw: '10.10', description: '' },
      { amountRaw: '2.255', description: '' },
    ];
    const total = splitItemsTotal(items, 'TND');
    const fields = buildTransactionFields(
      { ...BLANK, description: 'x', currency: 'TND', fromAccountId: 'a', occurredAt: '2026-11-03T10:00', amountRaw: total, items },
      true,
    )!;
    const sum = fields.items!.reduce((s, i) => s + Number(i.amount) * 1000, 0) / 1000;
    expect(Number(fields.amount)).toBe(sum);
    expect(fields.amount).toBe('12.355');
  });
});

describe('effectiveAccountIds', () => {
  it('uses the suggested account until one is picked', () => {
    expect(
      effectiveAccountIds({ type: 'EXPENSE', accounts: [usd, eur], suggestedAccountId: 'eur1' }),
    ).toMatchObject({ fromId: 'eur1' });
    expect(
      effectiveAccountIds({ type: 'EXPENSE', accounts: [usd, eur], fromAccountId: 'usd1', suggestedAccountId: 'eur1' }),
    ).toMatchObject({ fromId: 'usd1' });
  });

  it('ignores a picked account that is no longer in the list', () => {
    expect(
      effectiveAccountIds({ type: 'EXPENSE', accounts: [usd], fromAccountId: 'gone', suggestedAccountId: 'usd1' }).fromId,
    ).toBe('usd1');
  });

  it('defaults a transfer destination to another account in the same currency', () => {
    expect(
      effectiveAccountIds({ type: 'TRANSFER', accounts: [usd, eur, usd2], suggestedAccountId: 'usd1' }),
    ).toEqual({ fromId: 'usd1', toId: 'usd2' });
  });

  it('income goes into the suggested account', () => {
    expect(effectiveAccountIds({ type: 'INCOME', accounts: [usd, eur], suggestedAccountId: 'eur1' }).toId).toBe('eur1');
  });
});

describe('submit payload', () => {
  const base: TransactionFormValues = {
    ...BLANK,
    description: 'zz-Lunch',
    currency: 'USD',
    fromAccountId: 'usd1',
    occurredAt: '2026-11-03T12:30',
    amountRaw: '12.50',
    categoryId: 'food',
  };

  it('matches the web for a plain expense', () => {
    expect(buildCreateInput(base, false)).toEqual(webCreatePayload(base, false, parseMoneyInput));
  });

  it('matches the web for a split (no top-level category, memos trimmed)', () => {
    const v = {
      ...base,
      amountRaw: '12.50',
      categoryId: undefined,
      items: [
        { amountRaw: '10.00', categoryId: 'food', description: ' main ' },
        { amountRaw: '2.50', categoryId: '', description: '' },
      ],
    };
    const payload = buildCreateInput(v, true);
    expect(payload).toEqual(webCreatePayload(v, true, parseMoneyInput));
    expect(payload?.items).toEqual([
      { amount: '10', categoryId: 'food', memo: 'main' },
      { amount: '2.5', categoryId: undefined, memo: undefined },
    ]);
  });

  it('matches the web for income and a transfer', () => {
    const income = { ...base, type: 'INCOME' as const, toAccountId: 'usd1', fromAccountId: 'usd2' };
    expect(buildCreateInput(income, false)).toEqual(webCreatePayload(income, false, parseMoneyInput));
    expect(buildCreateInput(income, false)?.fromAccountId).toBeUndefined();
    const transfer = { ...base, type: 'TRANSFER' as const, toAccountId: 'usd2' };
    expect(buildCreateInput(transfer, false)).toEqual(webCreatePayload(transfer, false, parseMoneyInput));
    expect(buildCreateInput(transfer, false)?.categoryId).toBeUndefined();
  });

  it('matches the web for a recurring transaction with an end date (end of that local day)', () => {
    const v = { ...base, isRecurring: true, recurringInterval: 'MONTHLY' as const, recurringEndDate: '2027-03-31' };
    const payload = buildCreateInput(v, false);
    expect(payload).toEqual(webCreatePayload(v, false, parseMoneyInput));
    expect(payload?.recurringEndDate).toBe(new Date(2027, 2, 31, 23, 59, 59).toISOString());
  });

  it('drops the recurrence from a split, as the web does', () => {
    const v = {
      ...base,
      isRecurring: true,
      recurringInterval: 'MONTHLY' as const,
      items: [{ amountRaw: '1' }, { amountRaw: '2' }],
    };
    expect(buildCreateInput(v, true)).toMatchObject({ isRecurring: undefined, recurringInterval: undefined });
  });

  it('update sends the shared fields only', () => {
    const fields = buildTransactionFields(base, false)!;
    expect(fields).not.toHaveProperty('isRecurring');
    expect(fields).not.toHaveProperty('recurringEndDate');
  });

  it('refuses to build without an amount', () => {
    expect(buildCreateInput({ ...base, amountRaw: '0' }, false)).toBeNull();
  });
});

describe('the web schema, as the form uses it', () => {
  const schema = makeTransactionSchema([usd, eur, usd2]);
  const valid: TransactionFormValues = {
    ...BLANK,
    description: 'zz-x',
    currency: 'USD',
    fromAccountId: 'usd1',
    occurredAt: '2026-11-03T12:30',
    amountRaw: '5',
  };
  const messages = (v: TransactionFormValues) => {
    const r = schema.safeParse(v);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it('refuses a transfer between currencies with the web message', () => {
    expect(messages({ ...valid, type: 'TRANSFER', toAccountId: 'eur1' })).toContain(
      "Cross-currency transfers aren't supported (USD → EUR).",
    );
    expect(messages({ ...valid, type: 'TRANSFER', toAccountId: 'usd2' })).toEqual([]);
  });

  it('checks the recurring end date against the local transaction time', () => {
    const rec = { ...valid, isRecurring: true, recurringInterval: 'MONTHLY' as const };
    // Same local day as the transaction: 23:59:59 that day is still after 12:30.
    expect(messages({ ...rec, recurringEndDate: '2026-11-03' })).toEqual([]);
    expect(messages({ ...rec, recurringEndDate: '2026-11-02' })).toContain('End date must be after the transaction date.');
    expect(messages({ ...rec, occurredAt: '2026-11-03T23:59', recurringEndDate: '2026-11-03' })).toEqual([]);
    expect(messages({ ...valid, isRecurring: true })).toContain('Choose how often this repeats.');
  });
});
