import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { DraftTransactionsService } from '../draft-transactions/draft-transactions.service';
import { LedgerService } from '../ledger/ledger.service';
import { SearchService } from '../search/search.service';

@Injectable()
export class McpService {
  constructor(
    private readonly draftsService: DraftTransactionsService,
    private readonly searchService: SearchService,
    private readonly ledgerService: LedgerService,
    private readonly analyticsService: AnalyticsService,
    private readonly accountsService: AccountsService
  ) {}

  callTool(userId: string, tool: string, args: Record<string, unknown>) {
    switch (tool) {
      case 'create_draft_transaction':
        return this.draftsService.create(userId, args as never);
      case 'approve_draft_transaction':
        return this.draftsService.approve(userId, this.requiredString(args, 'draftId'));
      case 'search_transactions':
        return this.searchService.searchTransactions(userId, args as never);
      case 'get_balance':
        return this.ledgerService.getBalance(userId, args);
      case 'get_monthly_summary':
        return this.analyticsService.getMonthlySummary(
          userId,
          Number(args.year),
          Number(args.month),
          Boolean(args.refresh)
        );
      case 'list_accounts':
        return this.accountsService.list(userId);
      default:
        throw new BadRequestException(`Unknown MCP tool: ${tool}`);
    }
  }

  private requiredString(args: Record<string, unknown>, key: string) {
    const value = args[key];
    if (typeof value !== 'string' || !value) throw new BadRequestException(`${key} is required`);
    return value;
  }
}
