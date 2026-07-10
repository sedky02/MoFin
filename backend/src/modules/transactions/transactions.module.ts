import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { LedgerModule } from '../ledger/ledger.module';
import { RecurringTransactionsCron } from './recurring-transactions.cron';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [AccountsModule, CategoriesModule, LedgerModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, RecurringTransactionsCron],
  exports: [TransactionsService]
})
export class TransactionsModule {}
