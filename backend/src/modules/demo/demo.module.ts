import { Module } from '@nestjs/common';
import { DemoSeeder } from '../../demo/demo-seeder';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';
import { CategoriesModule } from '../categories/categories.module';
import { GoalsModule } from '../goals/goals.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { UsersModule } from '../users/users.module';
import { DemoCleanupCron } from './demo-cleanup.cron';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    GoalsModule,
  ],
  controllers: [DemoController],
  providers: [DemoService, DemoSeeder, DemoCleanupCron],
})
export class DemoModule {}
