import { Module } from '@nestjs/common';
import { AccountAccessModule } from '../account-access/account-access.module';
import { CategoriesModule } from '../categories/categories.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [AccountAccessModule, CategoriesModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
