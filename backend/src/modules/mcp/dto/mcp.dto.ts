import { z } from 'zod';
import { monthlySummaryQuerySchema } from '../../analytics/dto/analytics.dto';
import { listAccountsQuerySchema } from '../../accounts/dto/accounts.dto';
import { createDraftTransactionSchema } from '../../draft-transactions/dto/draft-transactions.dto';
import { goalHistoryQuerySchema, listGoalsQuerySchema } from '../../goals/dto/goals.dto';
import { getBalanceQuerySchema } from '../../ledger/dto/ledger.dto';
import { searchTransactionsSchema } from '../../search/dto/search.dto';

/**
 * Per-tool argument schemas. Previously MCP arguments were forwarded with
 * `as never` and never validated (audit A2) — a direct violation of the
 * "MCP must never bypass validation" rule. Each tool's args are now parsed
 * with the same schema the corresponding HTTP route uses.
 *
 * `approve_draft_transaction` is deliberately NOT exposed here: an AI holding
 * one mcp-scoped token must not be able to both create and approve a draft,
 * since approval is the human-confirmation checkpoint the whole draft flow
 * exists to enforce (SEC-XX). Approval only happens via the web UI.
 */
export const mcpToolSchemas = {
  create_draft_transaction: createDraftTransactionSchema,
  search_transactions: searchTransactionsSchema,
  get_balance: getBalanceQuerySchema,
  get_monthly_summary: monthlySummaryQuerySchema,
  list_accounts: listAccountsQuerySchema,
  list_goals: listGoalsQuerySchema,
  get_goal: z.object({ goalId: z.string().min(1) }),
  get_goal_history: goalHistoryQuerySchema.extend({ goalId: z.string().min(1) }),
} as const;

export type McpToolName = keyof typeof mcpToolSchemas;
