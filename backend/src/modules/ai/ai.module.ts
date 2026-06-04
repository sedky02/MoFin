import { Module } from '@nestjs/common';
import { DraftTransactionsModule } from '../draft-transactions/draft-transactions.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [DraftTransactionsModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService]
})
export class AiModule {}
