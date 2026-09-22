import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { LoggerModule } from './common/logger/logger.module';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { DraftTransactionsModule } from './modules/draft-transactions/draft-transactions.module';
import { GoalsModule } from './modules/goals/goals.module';
import { LedgerModule } from './modules/ledger/ledger.module';
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
    // Global baseline rate limit; auth endpoints tighten this further (audit
    // B5) via AuthThrottlerGuard. 300/min accommodates a dashboard's normal
    // burst of parallel fetches (accounts, transactions, goals, analytics,
    // etc. firing on load/refetch) per real client IP — see main.ts's
    // `trust proxy` setting, which is what makes "per real client IP" true
    // instead of this counting the whole user base as one BFF client.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    AuthModule,
    UsersModule,
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
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Order matters: Nest checks global filters in REVERSE registration
    // order, so AllExceptionsFilter (registered first, checked last) is the
    // fallback behind PrismaExceptionFilter's more specific `@Catch()` scope.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
