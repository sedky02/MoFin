import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DraftStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateDraftTransactionDto, RejectDraftDto } from './dto/draft-transactions.dto';
import { DraftTransactionsService } from './draft-transactions.service';

@UseGuards(JwtAuthGuard)
@Controller('draft-transactions')
export class DraftTransactionsController {
  constructor(private readonly draftsService: DraftTransactionsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDraftTransactionDto) {
    return this.draftsService.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: DraftStatus) {
    return this.draftsService.list(user.id, { status });
  }

  @Patch(':id/approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.draftsService.approve(user.id, id);
  }

  @Patch(':id/reject')
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RejectDraftDto) {
    return this.draftsService.reject(user.id, id, dto.reason);
  }
}
