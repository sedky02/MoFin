import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [AccountsModule, CategoriesModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService]
})
export class SearchModule {}
