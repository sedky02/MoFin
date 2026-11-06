import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AccountAccessModule } from '../account-access/account-access.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [PrismaModule, AccountAccessModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
