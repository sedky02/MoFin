import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AccountAccessModule } from '../account-access/account-access.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  imports: [PrismaModule, AccountAccessModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
