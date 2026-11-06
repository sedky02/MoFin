import { mcpToolSchemas } from './dto/mcp.dto';
import { MCP_TOOLS } from './mcp-tools';
import { McpService } from './mcp.service';

describe('McpService.dispatch', () => {
  const drafts = {
    create: jest.fn(() => 'created'),
    approve: jest.fn(() => 'approved'),
  };
  const search = { searchTransactions: jest.fn(() => 'searched') };
  const ledger = { getBalance: jest.fn(() => 'balance') };
  const analytics = { getMonthlySummary: jest.fn(() => 'summary') };
  const accounts = { list: jest.fn(() => 'accounts') };
  const categories = { list: jest.fn(() => 'categories') };
  const goals = {
    list: jest.fn(() => 'goals'),
    findOne: jest.fn(() => 'goal'),
    history: jest.fn(() => 'goal-history'),
  };

  // Fills the account in; tested on its own in draft-completer.spec.ts.
  const completer = {
    complete: jest.fn((_userId: string, data: object) =>
      Promise.resolve({ ...data, fromAccountId: 'acc-default' }),
    ),
  };

  const service = new McpService(
    drafts as never,
    search as never,
    ledger as never,
    analytics as never,
    accounts as never,
    goals as never,
    completer as never,
    categories as never,
  );

  afterEach(() => jest.clearAllMocks());

  const completed = {
    rawInput: 'x',
    parsedData: { fromAccountId: 'acc-default' },
    confidenceScore: 0.5,
  };

  it('routes create_draft_transaction to DraftTransactionsService.create, with the account picked server-side', async () => {
    const args = { rawInput: 'x', parsedData: {}, confidenceScore: 0.5 };
    await expect(
      service.dispatch('u1', 'create_draft_transaction', args),
    ).resolves.toBe('created');
    expect(completer.complete).toHaveBeenCalledWith('u1', {});
    // Labelled as MCP even when the caller doesn't say which app it is.
    expect(drafts.create).toHaveBeenCalledWith('u1', completed, {
      source: 'MCP',
    });
  });

  it("labels a draft with the connected app's name", async () => {
    const args = { rawInput: 'x', parsedData: {}, confidenceScore: 0.5 };
    await service.dispatch('u1', 'create_draft_transaction', args, {
      source: 'MCP',
      sourceClient: 'Claude',
    });
    expect(drafts.create).toHaveBeenCalledWith('u1', completed, {
      source: 'MCP',
      sourceClient: 'Claude',
    });
  });

  it('does not expose approve_draft_transaction as an MCP tool', () => {
    // Approval must go through a human-confirmed channel (the web UI), never
    // the same MCP connector that created the draft (SEC-XX).
    const toolNames: string[] = MCP_TOOLS.map((t) => t.name);
    expect(toolNames).not.toContain('approve_draft_transaction');
    expect(Object.keys(mcpToolSchemas)).not.toContain(
      'approve_draft_transaction',
    );
  });

  it('routes search_transactions to SearchService', () => {
    service.dispatch('u1', 'search_transactions', { q: 'coffee' });
    expect(search.searchTransactions).toHaveBeenCalledWith('u1', {
      q: 'coffee',
    });
  });

  it('routes get_balance to LedgerService', () => {
    service.dispatch('u1', 'get_balance', { currency: 'USD' });
    expect(ledger.getBalance).toHaveBeenCalledWith('u1', { currency: 'USD' });
  });

  it('routes get_monthly_summary with year, month, refresh, account and currency', () => {
    service.dispatch('u1', 'get_monthly_summary', {
      year: 2026,
      month: 6,
      refresh: true,
      currency: 'TND',
    });
    expect(analytics.getMonthlySummary).toHaveBeenCalledWith(
      'u1',
      2026,
      6,
      true,
      undefined,
      'TND',
    );

    service.dispatch('u1', 'get_monthly_summary', {
      year: 2026,
      month: 6,
      refresh: false,
      accountId: 'acc-1',
    });
    expect(analytics.getMonthlySummary).toHaveBeenCalledWith(
      'u1',
      2026,
      6,
      false,
      'acc-1',
      undefined,
    );
  });

  it('routes list_categories to CategoriesService, with the type filter', () => {
    const args = { limit: 20, offset: 0, status: 'active', type: 'EXPENSE' };
    expect(service.dispatch('u1', 'list_categories', args)).toBe('categories');
    expect(categories.list).toHaveBeenCalledWith('u1', args);
  });

  it('routes list_accounts to AccountsService, forwarding pagination args', () => {
    const args = { status: 'active', limit: 20, offset: 0 };
    service.dispatch('u1', 'list_accounts', args);
    expect(accounts.list).toHaveBeenCalledWith('u1', args);
  });

  it('routes list_goals to GoalsService, forwarding pagination args', () => {
    const args = { status: 'active', limit: 20, offset: 0 };
    service.dispatch('u1', 'list_goals', args);
    expect(goals.list).toHaveBeenCalledWith('u1', args);
  });

  it('routes get_goal using the goalId argument', () => {
    service.dispatch('u1', 'get_goal', { goalId: 'g1' });
    expect(goals.findOne).toHaveBeenCalledWith('u1', 'g1');
  });

  it('routes get_goal_history using the goalId argument, forwarding pagination args separately', () => {
    service.dispatch('u1', 'get_goal_history', {
      goalId: 'g1',
      limit: 20,
      offset: 0,
    });
    expect(goals.history).toHaveBeenCalledWith('u1', 'g1', {
      limit: 20,
      offset: 0,
    });
  });
});
