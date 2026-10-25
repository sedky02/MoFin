import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '../database/prisma.module';
import { AccountsModule } from '../modules/accounts/accounts.module';
import { CategoriesModule } from '../modules/categories/categories.module';
import { GoalsModule } from '../modules/goals/goals.module';
import { TransactionsModule } from '../modules/transactions/transactions.module';
import { UsersModule } from '../modules/users/users.module';
import { DemoSeeder } from './demo-seeder';

/**
 * Just the modules the demo seed writes through. AppModule would also want the
 * JWT, OAuth and mail settings and start the nightly jobs, none of which a
 * seed needs; only DATABASE_URL is read here.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: false }),
    PrismaModule,
    UsersModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    GoalsModule,
  ],
  providers: [DemoSeeder],
})
export class DemoSeedModule {}
