import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AccountAccessModule } from '../account-access/account-access.module';
import { CategoriesModule } from '../categories/categories.module';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({
  imports: [PrismaModule, AccountAccessModule, CategoriesModule],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
