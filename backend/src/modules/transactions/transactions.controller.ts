import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiZodBody } from '../../common/swagger/api-zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  CreateTransactionDto,
  createTransactionSchema,
  UpdateRecurringTransactionDto,
  updateRecurringTransactionSchema
} from './dto/transactions.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiZodBody(createTransactionSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createTransactionSchema)) dto: CreateTransactionDto,
  ) {
    return this.transactionsService.create(user.id, {
      ...dto,
      occurredAt: new Date(dto.occurredAt),
      recurringEndDate: dto.recurringEndDate ? new Date(dto.recurringEndDate) : undefined,
    });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transactionsService.getById(user.id, id);
  }

  @Patch(':id/recurring')
  @ApiZodBody(updateRecurringTransactionSchema)
  updateRecurring(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRecurringTransactionSchema)) dto: UpdateRecurringTransactionDto,
  ) {
    return this.transactionsService.updateRecurring(user.id, id, {
      ...dto,
      recurringEndDate:
        dto.recurringEndDate === null ? null : dto.recurringEndDate ? new Date(dto.recurringEndDate) : undefined,
    });
  }

  @Post(':id/recurring/cancel')
  cancelRecurring(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transactionsService.cancelRecurring(user.id, id);
  }
}
