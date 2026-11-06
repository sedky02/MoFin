import { Injectable } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { CategoriesService } from '../categories/categories.service';
import { DraftSource } from '@prisma/client';
import { DraftCompleter } from '../draft-transactions/draft-completer';
import { CreateDraftTransactionDto } from '../draft-transactions/dto/draft-transactions.dto';
import {
  DraftOrigin,
  DraftTransactionsService,
} from '../draft-transactions/draft-transactions.service';
import { GoalsService } from '../goals/goals.service';
import { LedgerService } from '../ledger/ledger.service';
import { SearchService } from '../search/search.service';
import { McpToolName } from './dto/mcp.dto';

/**
 * Arguments are already parsed against the tool's Zod schema, so dispatch trusts them. MCP is an
 * interface layer: it only calls application services, never Prisma.
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
    private readonly draftCompleter: DraftCompleter,
    private readonly categoriesService: CategoriesService,
  ) {}

  /** `origin` labels drafts with the connected app that made them; defaults to plain MCP. */
  dispatch(
    userId: string,
    tool: McpToolName,
    args: unknown,
    origin: DraftOrigin = { source: DraftSource.MCP },
  ): unknown {
    switch (tool) {
      case 'create_draft_transaction':
        return this.createDraft(
          userId,
          args as CreateDraftTransactionDto,
          origin,
        );
      case 'search_transactions':
        return this.searchService.searchTransactions(userId, args as never);
      case 'get_balance':
        return this.ledgerService.getBalance(userId, args as never);
      case 'get_monthly_summary': {
        const { year, month, refresh, accountId, currency } = args as {
          year: number;
          month: number;
          refresh: boolean;
          accountId?: string;
          currency?: string;
        };
        return this.analyticsService.getMonthlySummary(
          userId,
          year,
          month,
          refresh,
          accountId,
          currency,
        );
      }
      case 'list_accounts':
        return this.accountsService.list(userId, args as never);
      case 'list_categories':
        return this.categoriesService.list(userId, args as never);
      case 'list_goals':
        return this.goalsService.list(userId, args as never);
      case 'get_goal':
        return this.goalsService.findOne(
          userId,
          (args as { goalId: string }).goalId,
        );
      case 'get_goal_history': {
        const { goalId, ...query } = args as {
          goalId: string;
          limit: number;
          offset: number;
        };
        return this.goalsService.history(userId, goalId, query);
      }
    }
  }
  /** Checks the account and category are the user's and fills in what the assistant left out. */
  private async createDraft(
    userId: string,
    dto: CreateDraftTransactionDto,
    origin: DraftOrigin,
  ) {
    const parsedData = await this.draftCompleter.complete(
      userId,
      dto.parsedData,
    );
    return this.draftsService.create(userId, { ...dto, parsedData }, origin);
  }
}
