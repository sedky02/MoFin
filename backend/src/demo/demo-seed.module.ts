import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '../database/prisma.module';
import { AccountsService } from '../modules/accounts/accounts.service';
import { CategoriesService } from '../modules/categories/categories.service';
import { GoalsService } from '../modules/goals/goals.service';
import { LedgerService } from '../modules/ledger/ledger.service';
import { TransactionsService } from '../modules/transactions/transactions.service';
import { UsersService } from '../modules/users/users.service';
import { DemoSeeder } from './demo-seeder';

/**
 * Just the services the demo seed writes through, without their modules: the
 * modules bring controllers (and their guards, which want the throttler and
 * JWT setup) and the nightly jobs, none of which a seed needs. Only
 * DATABASE_URL is read.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), EventEmitterModule.forRoot({ wildcard: false }), PrismaModule],
  providers: [
    UsersService,
    AccountsService,
    CategoriesService,
    LedgerService,
    TransactionsService,
    GoalsService,
    DemoSeeder,
  ],
})
export class DemoSeedModule {}
