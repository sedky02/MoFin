import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { DraftCompleter } from './draft-completer';
import { DraftTransactionsController } from './draft-transactions.controller';
import { DraftTransactionsService } from './draft-transactions.service';

@Module({
  imports: [TransactionsModule],
  controllers: [DraftTransactionsController],
  providers: [DraftTransactionsService, DraftCompleter],
  exports: [DraftTransactionsService, DraftCompleter],
})
export class DraftTransactionsModule {}
