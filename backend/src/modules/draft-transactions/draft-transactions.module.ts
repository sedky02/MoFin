import { Module } from '@nestjs/common';
import { AccountAccessModule } from '../account-access/account-access.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { DraftCompleter } from './draft-completer';
import { DraftTransactionsController } from './draft-transactions.controller';
import { DraftTransactionsService } from './draft-transactions.service';

@Module({
  imports: [AccountAccessModule, TransactionsModule],
  controllers: [DraftTransactionsController],
  providers: [DraftTransactionsService, DraftCompleter],
  exports: [DraftTransactionsService, DraftCompleter],
})
export class DraftTransactionsModule {}
