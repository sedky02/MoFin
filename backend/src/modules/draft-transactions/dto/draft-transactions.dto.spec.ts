import { TransactionType } from '@prisma/client';
import {
  approveDraftSchema,
  createDraftTransactionSchema,
} from './draft-transactions.dto';

const base = {
  type: TransactionType.EXPENSE,
  description: 'Supermarket',
  amount: '10.50',
  currency: 'TND',
  occurredAt: '2026-11-07T10:00:00.000Z',
  fromAccountId: 'acc1',
};
const draft = (parsedData: object) => ({
  rawInput: 'receipt',
  confidenceScore: 0.9,
  parsedData: { ...base, ...parsedData },
});
const messagesOf = (input: unknown) => {
  const result = createDraftTransactionSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe('createDraftTransactionSchema items', () => {
  it('accepts a draft without items', () => {
    expect(createDraftTransactionSchema.safeParse(draft({})).success).toBe(
      true,
    );
  });

  it('accepts items that add up to the amount, decimals included', () => {
    const items = [
      { amount: '3.10', categoryId: 'food', memo: 'milk' },
      { amount: '7.40', categoryId: 'home' },
    ];
    expect(
      createDraftTransactionSchema.safeParse(draft({ items })).success,
    ).toBe(true);
  });

  it('tells the assistant the real sum when the items do not add up', () => {
    const messages = messagesOf(
      draft({ items: [{ amount: '3' }, { amount: '4' }] }),
    );
    expect(messages).toEqual([
      expect.stringContaining('add up to 7 but amount is 10.50'),
    ]);
  });

  it('rejects items on a transfer', () => {
    const messages = messagesOf(
      draft({
        type: TransactionType.TRANSFER,
        toAccountId: 'acc2',
        items: [{ amount: '5.25' }, { amount: '5.25' }],
      }),
    );
    expect(messages).toContain('Transfers cannot be split into multiple items');
  });

  it('rejects a top-level category on a split but allows one on a single item', () => {
    const two = [{ amount: '5.25' }, { amount: '5.25' }];
    expect(messagesOf(draft({ categoryId: 'food', items: two }))).toEqual([
      expect.stringContaining('cannot have its own categoryId'),
    ]);
    expect(
      messagesOf(draft({ categoryId: 'food', items: [{ amount: '10.50' }] })),
    ).toEqual([]);
  });

  it('rejects a zero item and an empty items array', () => {
    expect(
      messagesOf(draft({ items: [{ amount: '10.50' }, { amount: '0' }] })),
    ).toContain('Each item amount must be greater than zero');
    expect(messagesOf(draft({ items: [] })).length).toBeGreaterThan(0);
  });
});

describe('approveDraftSchema', () => {
  it('lets an approval replace the items without re-checking the sum yet', () => {
    const result = approveDraftSchema.safeParse({
      parsedData: { items: [{ amount: '1' }, { amount: '2' }] },
    });
    expect(result.success).toBe(true);
  });
});
