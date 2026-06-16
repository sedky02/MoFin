import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { SearchTransactionsDto, searchTransactionsSchema } from './dto/search.dto';
import { SearchService } from './search.service';

@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('transactions')
  transactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(searchTransactionsSchema)) query: SearchTransactionsDto,
  ) {
    return this.searchService.searchTransactions(user.id, query);
  }
}
