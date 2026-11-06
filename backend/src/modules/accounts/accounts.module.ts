import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AccountAccessModule } from '../account-access/account-access.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  imports: [PrismaModule, AccountAccessModule],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
