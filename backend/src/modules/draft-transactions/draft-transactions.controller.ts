import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiZodBody, ApiZodQuery } from '../../common/swagger/api-zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  ApproveDraftDto,
  CreateDraftTransactionDto,
  DraftListQuery,
  RejectDraftDto,
  approveDraftSchema,
  createDraftTransactionSchema,
  draftListQuerySchema,
  rejectDraftSchema,
} from './dto/draft-transactions.dto';
import { DraftTransactionsService } from './draft-transactions.service';

@ApiTags('draft-transactions')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('draft-transactions')
export class DraftTransactionsController {
  constructor(private readonly draftsService: DraftTransactionsService) {}

  @Post()
  @ApiZodBody(createDraftTransactionSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createDraftTransactionSchema)) dto: CreateDraftTransactionDto,
  ) {
    return this.draftsService.create(user.id, dto);
  }

  @Get()
  @ApiZodQuery(draftListQuerySchema)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(draftListQuerySchema)) query: DraftListQuery,
  ) {
    return this.draftsService.list(user.id, query);
  }

  @Patch(':id/approve')
  @ApiZodBody(approveDraftSchema)
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approveDraftSchema)) dto: ApproveDraftDto,
  ) {
    return this.draftsService.approve(user.id, id, dto?.parsedData);
  }

  @Patch(':id/reject')
  @ApiZodBody(rejectDraftSchema)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectDraftSchema)) dto: RejectDraftDto,
  ) {
    return this.draftsService.reject(user.id, id, dto.reason);
  }
}
