import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { GlobalJwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { LoggerModule } from './common/logger/logger.module';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { AccountAccessModule } from './modules/account-access/account-access.module';
import { AccountSharingModule } from './modules/account-sharing/account-sharing.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { DraftTransactionsModule } from './modules/draft-transactions/draft-transactions.module';
import { ExportModule } from './modules/export/export.module';
import { DemoModule } from './modules/demo/demo.module';
import { DemoRestrictionsGuard } from './common/guards/demo-restrictions.guard';
import { GoalsModule } from './modules/goals/goals.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { McpModule } from './modules/mcp/mcp.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OAuthModule } from './modules/oauth/oauth.module';
import { SearchModule } from './modules/search/search.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule,
    HealthModule,
    EventEmitterModule.forRoot({ wildcard: false }),
    ScheduleModule.forRoot(),
    // 300/min fits a dashboard's burst of parallel fetches per real client IP (see
    // trusted-client-ip.middleware.ts).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    AuthModule,
    UsersModule,
    AccountAccessModule,
    AccountSharingModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    DraftTransactionsModule,
    LedgerModule,
    AiModule,
    McpModule,
    OAuthModule,
    AnalyticsModule,
    NotificationsModule,
    SearchModule,
    BudgetsModule,
    GoalsModule,
    ExportModule,
    DemoModule,
    MaintenanceModule,
  ],
  providers: [
    // Guards run in registration order: rate limit first, then the JWT check on every route not
    // marked @Public().
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: GlobalJwtAuthGuard },
    // After the JWT guard, so it sees req.user.
    { provide: APP_GUARD, useClass: DemoRestrictionsGuard },
    // Nest checks filters in reverse registration order, so the catch-all goes first and Prisma's
    // specific filter wins.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
