import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OAuthMcpAuthGuard } from '../../common/guards/oauth-mcp-auth.guard';
import { AccountsModule } from '../accounts/accounts.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { DraftTransactionsModule } from '../draft-transactions/draft-transactions.module';
import { GoalsModule } from '../goals/goals.module';
import { LedgerModule } from '../ledger/ledger.module';
import { SearchModule } from '../search/search.module';
import { McpServerFactory } from './mcp-server.factory';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [
    JwtModule.register({}),
    DraftTransactionsModule,
    SearchModule,
    LedgerModule,
    AnalyticsModule,
    AccountsModule,
    GoalsModule,
  ],
  controllers: [McpController],
  providers: [McpService, McpServerFactory, OAuthMcpAuthGuard]
})
export class McpModule {}
