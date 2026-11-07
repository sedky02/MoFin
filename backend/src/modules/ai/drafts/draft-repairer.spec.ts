import { TransactionType } from '@prisma/client';
import { DraftContext } from './draft-context';
import { repairDraft } from './draft-repairer';
import { ModelDraft } from './model-draft-parser';

const ctx: DraftContext = {
  input: 'groceries',
  accounts: [
    { id: 'cash', name: 'Cash', type: 'CASH', currency: 'TND', userId: 'u1' },
  ],
  categories: [
    { id: 'food', name: 'Food', type: 'EXPENSE', userId: null },
    { id: 'home', name: 'Home', type: 'EXPENSE', userId: 'u1' },
    { id: 'salary', name: 'Salary', type: 'INCOME', userId: null },
  ],
  defaultAccountId: 'cash',
  timeZone: 'UTC',
  today: '2026-11-07',
  now: new Date('2026-11-07T10:00:00Z'),
};

const draft = (overrides: Partial<ModelDraft>): ModelDraft => ({
  type: TransactionType.EXPENSE,
  description: 'Supermarket',
  amount: '99',
  currency: 'TND',
  occurredAt: '2026-11-07',
  confidence: 0.9,
  ...overrides,
});

describe('repairDraft items', () => {
  it('takes the total from the items and drops the top-level category', () => {
    const { data } = repairDraft(
      draft({
        categoryId: 'food',
        items: [
          { amount: '3.50', categoryId: 'food', memo: 'milk' },
          { amount: '6', categoryId: 'home', memo: 'soap' },
        ],
      }),
      ctx,
    );
    expect(data.amount).toBe('9.5');
    expect(data.categoryId).toBeUndefined();
    expect(data.items).toEqual([
      { amount: '3.50', categoryId: 'food', memo: 'milk' },
      { amount: '6', categoryId: 'home', memo: 'soap' },
    ]);
  });

  it('drops an item category that is invented or of the wrong type, keeping the line', () => {
    const { data } = repairDraft(
      draft({
        items: [
          { amount: '3', categoryId: 'made-up' },
          { amount: '2', categoryId: 'salary' },
        ],
      }),
      ctx,
    );
    expect(data.items?.map((i) => i.categoryId)).toEqual([
      undefined,
      undefined,
    ]);
    expect(data.amount).toBe('5');
  });

  it('ignores items on a transfer and keeps the stated amount', () => {
    const { data } = repairDraft(
      draft({
        type: TransactionType.TRANSFER,
        fromAccountId: 'cash',
        items: [{ amount: '1' }, { amount: '2' }],
      }),
      ctx,
    );
    expect(data.items).toBeUndefined();
    expect(data.amount).toBe('99');
  });

  it('leaves a draft without items as it was', () => {
    const { data } = repairDraft(draft({ categoryId: 'food' }), ctx);
    expect(data.items).toBeUndefined();
    expect(data.amount).toBe('99');
    expect(data.categoryId).toBe('food');
  });
});
