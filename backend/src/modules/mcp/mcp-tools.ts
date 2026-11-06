import { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { McpToolName } from './dto/mcp.dto';

/**
 * MCP tool annotations: hints that let a client (Claude, ChatGPT) tell tools
 * apart, for example to offer "always allow" on the ones that only read. They
 * are hints, not enforcement: what a tool can really do is fixed by the
 * services behind it and by the draft rule below.
 *
 * MoFin only holds the user's own data, so no tool reaches an open world.
 */
const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
};

/**
 * Creates a PENDING draft, never a real transaction, and never edits or
 * deletes anything that exists, so it is not destructive. Every call makes a
 * new draft, so it is not idempotent.
 */
const CREATES_DRAFT: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

/**
 * Single source of MCP tool metadata. `name` MUST match a key in `mcpToolSchemas`
 * (the Zod schema map) — that schema becomes the tool's MCP inputSchema.
 */
export const MCP_TOOLS: ReadonlyArray<{
  name: McpToolName;
  title: string;
  description: string;
  annotations: ToolAnnotations;
}> = [
  {
    name: 'create_draft_transaction',
    annotations: CREATES_DRAFT,
    title: 'Create draft transaction',
    description:
      'Create a PENDING draft transaction from structured data. Never creates a real transaction directly — it must be approved first. ' +
      'EXPENSE uses fromAccountId, INCOME toAccountId, TRANSFER both. Pass an account id (from list_accounts) only when the user names the account; ' +
      "otherwise leave it out and MoFin picks the user's default account. An unknown account id is rejected.",
  },
  {
    name: 'search_transactions',
    annotations: READ_ONLY,
    title: 'Search transactions',
    description:
      "Search the user's transactions with text, category, account, amount, date, type and recurring filters, sorted by date, amount or next occurrence (paginated). `recurrence: series` lists each recurring series once, by its root. A root's `recurringStatus` is ACTIVE, PAUSED (nothing posts until the user resumes it; `recurringError` says why when it couldn't post) or CANCELLED.",
  },
  {
    name: 'get_balance',
    annotations: READ_ONLY,
    title: 'Get balance',
    description:
      "Compute account/currency balances: each account's opening balance plus its ledger entries. " +
      'Opening balances are never income and never appear in transactions or monthly summaries.',
  },
  {
    name: 'get_monthly_summary',
    annotations: READ_ONLY,
    title: 'Get monthly summary',
    description:
      'Income, expense, savings rate and category breakdown for a given year and month, in one currency. ' +
      'Pass `accountId` for a single account; otherwise `currency` (ISO code) is required. ' +
      '`activeCurrencies` lists every currency with activity that month.',
  },
  {
    name: 'list_accounts',
    annotations: READ_ONLY,
    title: 'List accounts',
    description: "List the user's active (non-archived) accounts.",
  },
  {
    name: 'list_goals',
    annotations: READ_ONLY,
    title: 'List goals',
    description:
      "List the user's active goals with their current period's live progress and status.",
  },
  {
    name: 'get_goal',
    annotations: READ_ONLY,
    title: 'Get goal',
    description:
      'Get a single goal with its current period live progress and status.',
  },
  {
    name: 'get_goal_history',
    annotations: READ_ONLY,
    title: 'Get goal history',
    description:
      "Get a goal's periods, newest first (targetAmount, progressAmount, status, progressSource). progressSource is LIVE for the open period, PERIOD_END for a finished period's recorded result, and ENDED for progress frozen when the goal was ended.",
  },
] as const;
