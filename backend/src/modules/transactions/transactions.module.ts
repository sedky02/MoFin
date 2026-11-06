import { Module } from '@nestjs/common';
import { AccountAccessModule } from '../account-access/account-access.module';
import { CategoriesModule } from '../categories/categories.module';
import { LedgerModule } from '../ledger/ledger.module';
import { RecurringSeriesService } from './recurring-series.service';
import { RecurringTransactionsCron } from './recurring-transactions.cron';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [AccountAccessModule, CategoriesModule, LedgerModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    RecurringSeriesService,
    RecurringTransactionsCron,
  ],
  exports: [TransactionsService, RecurringSeriesService],
})
export class TransactionsModule {}
