import { Module } from '@nestjs/common';
import { AccountAccessService } from './account-access.service';

@Module({
  providers: [AccountAccessService],
  exports: [AccountAccessService],
})
export class AccountAccessModule {}
