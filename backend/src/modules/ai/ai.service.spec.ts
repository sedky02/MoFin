import { AiService } from './ai.service';
import { AiUnavailableException } from './llm/ai-unavailable.exception';

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

function setup(chat: jest.Mock, enabled = true) {
  let count = 0;
  const drafts = {
    create: jest.fn((_userId: string, dto: unknown) =>
      Promise.resolve({ id: `d${++count}`, ...(dto as object) }),
    ),
  };
  const accounts = {
    list: jest.fn(() => Promise.resolve({ data: [ACCOUNT, SAVINGS] })),
  };
  const categories = {
    list: jest.fn(() => Promise.resolve({ data: [FOOD, SALARY] })),
  };
  const llm = { enabled, chat };
  const service = new AiService(
    drafts as never,
    accounts as never,
    categories as never,
    llm,
  );
  return { service, drafts, llm };
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
  it('creates one PENDING draft per transaction the model finds', async () => {
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
    const { service, drafts } = setup(chat);

    const result = await service.createDraftsFromNaturalLanguage('u1', {
      input: 'spent 42.5 on groceries and got paid 3200',
    });

    expect(result).toHaveLength(2);
    expect(drafts.create).toHaveBeenCalledTimes(2);
    const second = (drafts.create.mock.calls[1] as unknown[])[1] as {
      rawInput: string;
      parsedData: { amount: string; toAccountId: string };
      confidenceScore: number;
    };
    expect(second.rawInput).toBe('spent 42.5 on groceries and got paid 3200');
    expect(second.parsedData.amount).toBe('3200');
    expect(second.parsedData.toAccountId).toBe(ACCOUNT.id);
  });

  it("drops ids that are not the user's and falls back to the default account", async () => {
    const chat = jest.fn(() =>
      reply({
        drafts: [draft({ fromAccountId: 'invented', categoryId: 'invented' })],
      }),
    );
    const { service, drafts } = setup(chat);

    await service.createDraftsFromNaturalLanguage('u1', {
      input: 'groceries 42.5',
      defaultAccountId: SAVINGS.id,
    });

    const saved = (drafts.create.mock.calls[0] as unknown[])[1] as {
      parsedData: { fromAccountId?: string; categoryId?: string };
      confidenceScore: number;
    };
    expect(saved.parsedData.fromAccountId).toBe(SAVINGS.id);
    expect(saved.parsedData.categoryId).toBeUndefined();
    expect(saved.confidenceScore).toBeLessThanOrEqual(0.5);
  });

  it('ignores a category whose type does not match the transaction', async () => {
    const chat = jest.fn(() =>
      reply({ drafts: [draft({ categoryId: SALARY.id })] }),
    );
    const { service, drafts } = setup(chat);

    await service.createDraftsFromNaturalLanguage('u1', { input: 'x 5' });

    const saved = (drafts.create.mock.calls[0] as unknown[])[1] as {
      parsedData: { categoryId?: string };
    };
    expect(saved.parsedData.categoryId).toBeUndefined();
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
    expect(drafts.create).toHaveBeenCalledTimes(1);
  });

  it('falls back to the local parser after two invalid replies', async () => {
    const chat = jest.fn(() => reply({ drafts: [] }));
    const { service, drafts } = setup(chat);

    const result = await service.createDraftsFromNaturalLanguage('u1', {
      input: 'coffee 4.5',
      defaultAccountId: ACCOUNT.id,
    });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    const saved = (drafts.create.mock.calls[0] as unknown[])[1] as {
      parsedData: { amount: string };
      confidenceScore: number;
    };
    expect(saved.parsedData.amount).toBe('4.5');
    expect(saved.confidenceScore).toBe(0.72);
  });

  it('falls back to the local parser when the provider is down', async () => {
    const chat = jest.fn(() => Promise.reject(new AiUnavailableException()));
    const { service, drafts } = setup(chat);

    await service.createDraftsFromNaturalLanguage('u1', {
      input: 'coffee 4.5',
    });

    expect(drafts.create).toHaveBeenCalledTimes(1);
  });

  it('uses the local parser without calling the model when no key is set', async () => {
    const chat = jest.fn();
    const { service, drafts } = setup(chat, false);

    await service.createDraftsFromNaturalLanguage('u1', {
      input: 'coffee 4.5',
    });

    expect(chat).not.toHaveBeenCalled();
    expect(drafts.create).toHaveBeenCalledTimes(1);
  });

  it('accepts lenient model output: numeric amount, lowercase currency', async () => {
    const chat = jest.fn(() =>
      reply({ drafts: [draft({ amount: 12.5, currency: 'tnd' })] }),
    );
    const { service, drafts } = setup(chat);

    await service.createDraftsFromNaturalLanguage('u1', {
      input: 'lunch 12.5',
    });

    const saved = (drafts.create.mock.calls[0] as unknown[])[1] as {
      parsedData: { amount: string; currency: string };
    };
    expect(saved.parsedData.amount).toBe('12.5');
    expect(saved.parsedData.currency).toBe('TND');
  });
});
