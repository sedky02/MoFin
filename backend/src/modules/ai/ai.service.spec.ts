import { AiService } from './ai.service';
import { ModelDraftParser } from './drafts/model-draft-parser';
import { REGEX_CONFIDENCE } from './drafts/regex-draft-parser';
import {
  AiProviderRejectedException,
  AiUnavailableException,
} from './llm/ai-unavailable.exception';

const ACCOUNT = {
  id: 'acc-1',
  name: 'Checking',
  type: 'CHECKING',
  currency: 'TND',
};
const SAVINGS = {
  id: 'acc-2',
  name: 'Savings',
  type: 'SAVINGS',
  currency: 'TND',
};
const FOOD = { id: 'cat-food', name: 'Groceries', type: 'EXPENSE' };
const SALARY = { id: 'cat-salary', name: 'Salary', type: 'INCOME' };

interface SavedDraft {
  rawInput: string;
  parsedData: {
    type: string;
    amount: string;
    currency: string;
    occurredAt: string;
    fromAccountId?: string;
    toAccountId?: string;
    categoryId?: string;
  };
  confidenceScore: number;
}

function setup(
  chat: jest.Mock,
  enabled = true,
  accountList: Array<typeof ACCOUNT> = [ACCOUNT, SAVINGS],
) {
  const drafts = {
    createMany: jest.fn((_userId: string, dtos: SavedDraft[]) =>
      Promise.resolve(dtos.map((dto, i) => ({ id: `d${i + 1}`, ...dto }))),
    ),
  };
  const accounts = {
    list: jest.fn(() =>
      Promise.resolve({ data: accountList, total: accountList.length }),
    ),
  };
  const categories = {
    list: jest.fn(() => Promise.resolve({ data: [FOOD, SALARY], total: 2 })),
  };
  const llm = { enabled, chat };
  const service = new AiService(
    drafts as never,
    accounts as never,
    categories as never,
    new ModelDraftParser(llm),
  );
  /** The i-th draft of the (single) createMany call. */
  const saved = (i = 0): SavedDraft => drafts.createMany.mock.calls[0][1][i];
  return { service, drafts, saved };
}

const reply = (value: unknown) =>
  Promise.resolve({
    content: typeof value === 'string' ? value : JSON.stringify(value),
    toolCalls: [],
  });

const draft = (over: Record<string, unknown> = {}) => ({
  type: 'EXPENSE',
  description: 'Groceries',
  amount: '42.50',
  currency: 'TND',
  occurredAt: '2026-11-03',
  fromAccountId: ACCOUNT.id,
  toAccountId: null,
  categoryId: FOOD.id,
  confidence: 0.9,
  ...over,
});

describe('AiService.createDraftsFromNaturalLanguage', () => {
  afterEach(() => jest.useRealTimers());

  it('creates every draft the model finds in one createMany call', async () => {
    const chat = jest.fn(() =>
      reply({
        drafts: [
          draft(),
          draft({
            type: 'INCOME',
            description: 'Salary',
            amount: 3200,
            fromAccountId: null,
            toAccountId: ACCOUNT.id,
            categoryId: SALARY.id,
          }),
        ],
      }),
    );
    const { service, drafts, saved } = setup(chat);

    const result = await service.createDraftsFromNaturalLanguage('u1', {
      input: 'spent 42.5 on groceries and got paid 3200',
    });

    expect(result).toHaveLength(2);
    expect(drafts.createMany).toHaveBeenCalledTimes(1);
    expect(saved(1).rawInput).toBe('spent 42.5 on groceries and got paid 3200');
    expect(saved(1).parsedData.amount).toBe('3200');
    expect(saved(1).parsedData.toAccountId).toBe(ACCOUNT.id);
  });

  it("drops ids that are not the user's and falls back to the default account", async () => {
    const chat = jest.fn(() =>
      reply({
        drafts: [draft({ fromAccountId: 'invented', categoryId: 'invented' })],
      }),
    );
    const { service, saved } = setup(chat);

    await service.createDraftsFromNaturalLanguage('u1', {
      input: 'groceries 42.5',
      defaultAccountId: SAVINGS.id,
    });

    expect(saved().parsedData.fromAccountId).toBe(SAVINGS.id);
    expect(saved().parsedData.categoryId).toBeUndefined();
    expect(saved().confidenceScore).toBeLessThanOrEqual(0.5);
  });

  it('ignores a category whose type does not match the transaction', async () => {
    const chat = jest.fn(() =>
      reply({ drafts: [draft({ categoryId: SALARY.id })] }),
    );
    const { service, saved } = setup(chat);

    await service.createDraftsFromNaturalLanguage('u1', { input: 'x 5' });

    expect(saved().parsedData.categoryId).toBeUndefined();
  });

  it('flags a transfer to the same account', async () => {
    const chat = jest.fn(() =>
      reply({
        drafts: [
          draft({
            type: 'TRANSFER',
            fromAccountId: ACCOUNT.id,
            toAccountId: ACCOUNT.id,
            categoryId: null,
          }),
        ],
      }),
    );
    const { service, saved } = setup(chat);

    await service.createDraftsFromNaturalLanguage('u1', { input: 'move 50' });

    expect(saved().parsedData.toAccountId).toBeUndefined();
    expect(saved().confidenceScore).toBeLessThanOrEqual(0.4);
  });

  it('retries once on invalid output, then succeeds', async () => {
    const chat = jest
      .fn()
      .mockImplementationOnce(() => reply('not json'))
      .mockImplementationOnce(() => reply({ drafts: [draft()] }));
    const { service, drafts } = setup(chat);

    await service.createDraftsFromNaturalLanguage('u1', {
      input: 'groceries 42.5',
    });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(drafts.createMany).toHaveBeenCalledTimes(1);
  });

  it('falls back to the local parser after two invalid replies', async () => {
    const chat = jest.fn(() => reply({ drafts: [] }));
    const { service, saved } = setup(chat);

    const result = await service.createDraftsFromNaturalLanguage('u1', {
      input: 'coffee 4.5',
      defaultAccountId: ACCOUNT.id,
    });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(saved().parsedData.amount).toBe('4.5');
    expect(saved().confidenceScore).toBe(REGEX_CONFIDENCE.single);
  });

  it.each([
    ['down', new AiUnavailableException()],
    ['rejecting the request', new AiProviderRejectedException()],
  ])(
    'falls back to the local parser when the provider is %s',
    async (_label, failure) => {
      const chat = jest.fn(() => Promise.reject(failure));
      const { service, drafts } = setup(chat);

      await service.createDraftsFromNaturalLanguage('u1', {
        input: 'coffee 4.5',
      });

      expect(drafts.createMany).toHaveBeenCalledTimes(1);
    },
  );

  it('uses the local parser without calling the model when no key is set', async () => {
    const chat = jest.fn();
    const { service, drafts } = setup(chat, false);

    await service.createDraftsFromNaturalLanguage('u1', {
      input: 'coffee 4.5',
    });

    expect(chat).not.toHaveBeenCalled();
    expect(drafts.createMany).toHaveBeenCalledTimes(1);
  });

  it('accepts lenient model output: numeric amount, lowercase currency, datetime', async () => {
    const chat = jest.fn(() =>
      reply({
        drafts: [
          draft({
            amount: 12.5,
            currency: 'tnd',
            occurredAt: '2026-11-03T08:00:00Z',
          }),
        ],
      }),
    );
    const { service, saved } = setup(chat);

    await service.createDraftsFromNaturalLanguage('u1', {
      input: 'lunch 12.5',
    });

    expect(saved().parsedData.amount).toBe('12.5');
    expect(saved().parsedData.currency).toBe('TND');
    expect(saved().parsedData.occurredAt.startsWith('2026-11-03')).toBe(true);
  });

  describe('dates in the user time zone', () => {
    // 23:30 on Nov 4 in New York is already Nov 5 in UTC.
    const NOW = new Date('2026-11-05T04:30:00Z');

    it('tells the model the local date, not the UTC one', async () => {
      jest.useFakeTimers({ now: NOW });
      const chat = jest.fn(() => reply({ drafts: [draft()] }));
      const { service } = setup(chat);

      await service.createDraftsFromNaturalLanguage('u1', {
        input: 'coffee 4 yesterday',
        timeZone: 'America/New_York',
      });

      const prompt = (
        chat.mock.calls[0] as unknown as [{ messages: { content: string }[] }]
      )[0].messages[0].content;
      expect(prompt).toContain('Today is 2026-11-04');
    });

    it('stores an earlier day at local noon so it stays on that day', async () => {
      jest.useFakeTimers({ now: NOW });
      const chat = jest.fn(() =>
        reply({ drafts: [draft({ occurredAt: '2026-11-03' })] }),
      );
      const { service, saved } = setup(chat);

      await service.createDraftsFromNaturalLanguage('u1', {
        input: 'coffee 4 yesterday',
        timeZone: 'America/New_York',
      });

      // Noon in New York (UTC-5 in November) is 17:00 UTC.
      expect(saved().parsedData.occurredAt).toBe('2026-11-03T17:00:00.000Z');
    });

    it('keeps the actual time for today', async () => {
      jest.useFakeTimers({ now: NOW });
      const chat = jest.fn(() =>
        reply({ drafts: [draft({ occurredAt: '2026-11-04' })] }),
      );
      const { service, saved } = setup(chat);

      await service.createDraftsFromNaturalLanguage('u1', {
        input: 'coffee 4',
        timeZone: 'America/New_York',
      });

      expect(saved().parsedData.occurredAt).toBe(NOW.toISOString());
    });
  });

  describe('local parser', () => {
    const fallback = async (
      input: string,
      over: {
        accounts?: Array<typeof ACCOUNT>;
        defaultAccountId?: string;
      } = {},
    ) => {
      const { service, saved } = setup(jest.fn(), false, over.accounts);
      await service.createDraftsFromNaturalLanguage('u1', {
        input,
        defaultAccountId: over.defaultAccountId,
      });
      return saved();
    };

    it('takes the amount next to a currency, not the first number', async () => {
      const result = await fallback('2 coffees for 5 TND');
      expect(result.parsedData.amount).toBe('5');
      expect(result.confidenceScore).toBe(REGEX_CONFIDENCE.single);
    });

    it('takes the largest number when none is marked, and says it is unsure', async () => {
      const result = await fallback('50 for 2 tickets');
      expect(result.parsedData.amount).toBe('50');
      expect(result.confidenceScore).toBe(REGEX_CONFIDENCE.ambiguous);
    });

    it('reads thousands separators', async () => {
      expect((await fallback('rent 1,200.50')).parsedData.amount).toBe(
        '1200.50',
      );
    });

    it('never claims more confidence than a repaired model draft', async () => {
      const result = await fallback('coffee 4.5');
      expect(result.confidenceScore).toBeLessThanOrEqual(0.4);
      expect((await fallback('coffee')).confidenceScore).toBe(
        REGEX_CONFIDENCE.noAmount,
      );
    });

    it("uses the account's currency instead of assuming TND", async () => {
      const euro = { ...ACCOUNT, currency: 'EUR' };
      const result = await fallback('coffee 4.5', { accounts: [euro] });
      expect(result.parsedData.currency).toBe('EUR');
      // The only account is the obvious default.
      expect(result.parsedData.fromAccountId).toBe(euro.id);
    });

    it('reads a currency symbol', async () => {
      expect((await fallback('lunch $12')).parsedData.currency).toBe('USD');
    });
  });
});
