import { mcpToolSchemas } from './dto/mcp.dto';
import { MCP_TOOLS } from './mcp-tools';
import { McpService } from './mcp.service';

describe('McpService.dispatch', () => {
  const drafts = { create: jest.fn(() => 'created'), approve: jest.fn(() => 'approved') };
  const search = { searchTransactions: jest.fn(() => 'searched') };
  const ledger = { getBalance: jest.fn(() => 'balance') };
  const analytics = { getMonthlySummary: jest.fn(() => 'summary') };
  const accounts = { list: jest.fn(() => 'accounts') };
  const goals = {
    list: jest.fn(() => 'goals'),
    findOne: jest.fn(() => 'goal'),
    history: jest.fn(() => 'goal-history'),
  };

  const service = new McpService(
    drafts as never,
    search as never,
    ledger as never,
    analytics as never,
    accounts as never,
    goals as never,
  );

  afterEach(() => jest.clearAllMocks());

  it('routes create_draft_transaction to DraftTransactionsService.create', () => {
    const args = { rawInput: 'x', parsedData: {}, confidenceScore: 0.5 };
    expect(service.dispatch('u1', 'create_draft_transaction', args)).toBe('created');
    expect(drafts.create).toHaveBeenCalledWith('u1', args);
  });

  it('does not expose approve_draft_transaction as an MCP tool', () => {
    // Approval must go through a human-confirmed channel (the web UI), never
    // the same MCP connector that created the draft (SEC-XX).
    const toolNames: string[] = MCP_TOOLS.map((t) => t.name);
    expect(toolNames).not.toContain('approve_draft_transaction');
    expect(Object.keys(mcpToolSchemas)).not.toContain('approve_draft_transaction');
  });

  it('routes search_transactions to SearchService', () => {
    service.dispatch('u1', 'search_transactions', { q: 'coffee' });
    expect(search.searchTransactions).toHaveBeenCalledWith('u1', { q: 'coffee' });
  });

  it('routes get_balance to LedgerService', () => {
    service.dispatch('u1', 'get_balance', { currency: 'USD' });
    expect(ledger.getBalance).toHaveBeenCalledWith('u1', { currency: 'USD' });
  });

  it('routes get_monthly_summary with year, month and refresh', () => {
    service.dispatch('u1', 'get_monthly_summary', { year: 2026, month: 6, refresh: true });
    expect(analytics.getMonthlySummary).toHaveBeenCalledWith('u1', 2026, 6, true);
  });

  it('routes list_accounts to AccountsService', () => {
    service.dispatch('u1', 'list_accounts', {});
    expect(accounts.list).toHaveBeenCalledWith('u1');
  });

  it('routes list_goals to GoalsService', () => {
    service.dispatch('u1', 'list_goals', {});
    expect(goals.list).toHaveBeenCalledWith('u1');
  });

  it('routes get_goal using the goalId argument', () => {
    service.dispatch('u1', 'get_goal', { goalId: 'g1' });
    expect(goals.findOne).toHaveBeenCalledWith('u1', 'g1');
  });

  it('routes get_goal_history using the goalId argument', () => {
    service.dispatch('u1', 'get_goal_history', { goalId: 'g1' });
    expect(goals.history).toHaveBeenCalledWith('u1', 'g1');
  });
});
