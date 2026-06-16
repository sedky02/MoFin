import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuthModule } from '../auth/auth.module';
import { DraftTransactionsModule } from '../draft-transactions/draft-transactions.module';
import { LedgerModule } from '../ledger/ledger.module';
import { SearchModule } from '../search/search.module';
import { McpServerFactory } from './mcp-server.factory';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [AuthModule, DraftTransactionsModule, SearchModule, LedgerModule, AnalyticsModule, AccountsModule],
  controllers: [McpController],
  providers: [McpService, McpServerFactory]
})
export class McpModule {}
