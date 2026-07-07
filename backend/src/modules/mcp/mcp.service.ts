import { Injectable } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { DraftTransactionsService } from '../draft-transactions/draft-transactions.service';
import { GoalsService } from '../goals/goals.service';
import { LedgerService } from '../ledger/ledger.service';
import { SearchService } from '../search/search.service';
import { McpToolName } from './dto/mcp.dto';

/**
 * Routes a validated MCP tool call to the owning application service.
 *
 * Arguments arrive already parsed by the MCP server against the tool's Zod
 * `inputSchema`, so dispatch trusts them. MCP remains an interface layer: it
 * only calls application services and never touches Prisma directly.
 */
@Injectable()
export class McpService {
  constructor(
    private readonly draftsService: DraftTransactionsService,
    private readonly searchService: SearchService,
    private readonly ledgerService: LedgerService,
    private readonly analyticsService: AnalyticsService,
    private readonly accountsService: AccountsService,
    private readonly goalsService: GoalsService,
  ) {}

  dispatch(userId: string, tool: McpToolName, args: unknown): unknown {
    switch (tool) {
      case 'create_draft_transaction':
        return this.draftsService.create(userId, args as never);
      case 'approve_draft_transaction':
        return this.draftsService.approve(userId, (args as { draftId: string }).draftId);
      case 'search_transactions':
        return this.searchService.searchTransactions(userId, args as never);
      case 'get_balance':
        return this.ledgerService.getBalance(userId, args as never);
      case 'get_monthly_summary': {
        const { year, month, refresh } = args as { year: number; month: number; refresh: boolean };
        return this.analyticsService.getMonthlySummary(userId, year, month, refresh);
      }
      case 'list_accounts':
        return this.accountsService.list(userId);
      case 'list_goals':
        return this.goalsService.list(userId);
      case 'get_goal':
        return this.goalsService.findOne(userId, (args as { goalId: string }).goalId);
      case 'get_goal_history':
        return this.goalsService.history(userId, (args as { goalId: string }).goalId);
    }
  }
}
