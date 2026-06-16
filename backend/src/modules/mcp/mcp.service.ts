import { BadRequestException, Injectable } from '@nestjs/common';
import { ZodError } from 'zod';
import { AccountsService } from '../accounts/accounts.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { DraftTransactionsService } from '../draft-transactions/draft-transactions.service';
import { LedgerService } from '../ledger/ledger.service';
import { SearchService } from '../search/search.service';
import { McpToolName, mcpToolSchemas } from './dto/mcp.dto';

@Injectable()
export class McpService {
  constructor(
    private readonly draftsService: DraftTransactionsService,
    private readonly searchService: SearchService,
    private readonly ledgerService: LedgerService,
    private readonly analyticsService: AnalyticsService,
    private readonly accountsService: AccountsService,
  ) {}

  callTool(userId: string, tool: string, args: Record<string, unknown>) {
    if (!(tool in mcpToolSchemas)) {
      throw new BadRequestException(`Unknown MCP tool: ${tool}`);
    }

    // Validate the tool arguments with the same schema the HTTP route uses, so
    // the MCP path can never bypass validation (audit A2).
    const parsed = this.parseArgs(tool as McpToolName, args);

    switch (tool as McpToolName) {
      case 'create_draft_transaction':
        return this.draftsService.create(userId, parsed as never);
      case 'approve_draft_transaction':
        return this.draftsService.approve(userId, (parsed as { draftId: string }).draftId);
      case 'search_transactions':
        return this.searchService.searchTransactions(userId, parsed as never);
      case 'get_balance':
        return this.ledgerService.getBalance(userId, parsed as never);
      case 'get_monthly_summary': {
        const { year, month, refresh } = parsed as { year: number; month: number; refresh: boolean };
        return this.analyticsService.getMonthlySummary(userId, year, month, refresh);
      }
      case 'list_accounts':
        return this.accountsService.list(userId);
    }
  }

  private parseArgs(tool: McpToolName, args: Record<string, unknown>): unknown {
    try {
      return mcpToolSchemas[tool].parse(args);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: `Invalid arguments for MCP tool '${tool}'`,
          errors: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        });
      }
      throw error;
    }
  }
}
