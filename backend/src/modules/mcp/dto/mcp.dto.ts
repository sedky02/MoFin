import { z } from 'zod';
import { monthlySummaryQuerySchema } from '../../analytics/dto/analytics.dto';
import { createDraftTransactionSchema } from '../../draft-transactions/dto/draft-transactions.dto';
import { getBalanceQuerySchema } from '../../ledger/dto/ledger.dto';
import { searchTransactionsSchema } from '../../search/dto/search.dto';

/**
 * Per-tool argument schemas. Previously MCP arguments were forwarded with
 * `as never` and never validated (audit A2) — a direct violation of the
 * "MCP must never bypass validation" rule. Each tool's args are now parsed
 * with the same schema the corresponding HTTP route uses.
 */
export const mcpToolSchemas = {
  create_draft_transaction: createDraftTransactionSchema,
  approve_draft_transaction: z.object({ draftId: z.string().min(1) }),
  search_transactions: searchTransactionsSchema,
  get_balance: getBalanceQuerySchema,
  get_monthly_summary: monthlySummaryQuerySchema,
  list_accounts: z.object({}).strip(),
} as const;

export type McpToolName = keyof typeof mcpToolSchemas;
