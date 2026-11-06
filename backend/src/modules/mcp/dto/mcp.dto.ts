import { z } from 'zod';
import { monthlySummaryQueryObject } from '../../analytics/dto/analytics.dto';
import { listAccountsQuerySchema } from '../../accounts/dto/accounts.dto';
import { listCategoriesQuerySchema } from '../../categories/dto/categories.dto';
import { createDraftTransactionSchema } from '../../draft-transactions/dto/draft-transactions.dto';
import {
  goalHistoryQuerySchema,
  listGoalsQuerySchema,
} from '../../goals/dto/goals.dto';
import { getBalanceQuerySchema } from '../../ledger/dto/ledger.dto';
import { searchTransactionsSchema } from '../../search/dto/search.dto';

/**
 * Each tool's args use the same schema as its HTTP route, so MCP can't bypass validation.
 * approve_draft_transaction is not exposed: one token must not both create and approve.
 */
export const mcpToolSchemas = {
  create_draft_transaction: createDraftTransactionSchema,
  search_transactions: searchTransactionsSchema,
  get_balance: getBalanceQuerySchema,
  // The plain object, since MCP needs a raw shape. The "currency unless accountId"
  // rule is enforced again by AnalyticsService.getMonthlySummary.
  get_monthly_summary: monthlySummaryQueryObject,
  list_accounts: listAccountsQuerySchema,
  list_categories: listCategoriesQuerySchema,
  list_goals: listGoalsQuerySchema,
  get_goal: z.object({ goalId: z.string().min(1) }),
  get_goal_history: goalHistoryQuerySchema.extend({
    goalId: z.string().min(1),
  }),
} as const;

export type McpToolName = keyof typeof mcpToolSchemas;
