import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { DraftTransactionsController } from './draft-transactions.controller';
import { DraftTransactionsService } from './draft-transactions.service';

@Module({
  imports: [TransactionsModule],
  controllers: [DraftTransactionsController],
  providers: [DraftTransactionsService],
  exports: [DraftTransactionsService]
})
export class DraftTransactionsModule {}
