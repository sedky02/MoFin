import { McpToolName } from './dto/mcp.dto';

/**
 * Single source of MCP tool metadata. `name` MUST match a key in `mcpToolSchemas`
 * (the Zod schema map) — that schema becomes the tool's MCP inputSchema.
 */
export const MCP_TOOLS: ReadonlyArray<{ name: McpToolName; title: string; description: string }> = [
  {
    name: 'create_draft_transaction',
    title: 'Create draft transaction',
    description:
      'Create a PENDING draft transaction from structured data. Never creates a real transaction directly — it must be approved first.',
  },
  {
    name: 'approve_draft_transaction',
    title: 'Approve draft transaction',
    description: 'Approve a pending draft, creating the real transaction and its ledger entries.',
  },
  {
    name: 'search_transactions',
    title: 'Search transactions',
    description: "Search the user's transactions with text, category, account, amount and date filters (paginated).",
  },
  {
    name: 'get_balance',
    title: 'Get balance',
    description: 'Compute account/currency balances from the ledger entries.',
  },
  {
    name: 'get_monthly_summary',
    title: 'Get monthly summary',
    description: 'Income, expense, savings rate and category breakdown for a given year and month.',
  },
  {
    name: 'list_accounts',
    title: 'List accounts',
    description: "List the user's active (non-archived) accounts.",
  },
  {
    name: 'list_goals',
    title: 'List goals',
    description: "List the user's active goals with their current period's live progress and status.",
  },
  {
    name: 'get_goal',
    title: 'Get goal',
    description: 'Get a single goal with its current period live progress and status.',
  },
  {
    name: 'get_goal_history',
    title: 'Get goal history',
    description: "Get a goal's past period instances (targetAmount, progressAmount, status) for historical tracking.",
  },
] as const;
