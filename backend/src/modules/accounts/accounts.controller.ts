import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiZodBody, ApiZodQuery } from '../../common/swagger/api-zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AccountsService } from './accounts.service';
import {
  CreateAccountDto,
  ListAccountsQueryDto,
  UpdateAccountDto,
  createAccountSchema,
  listAccountsQuerySchema,
  updateAccountSchema,
} from './dto/accounts.dto';

@ApiTags('accounts')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @ApiZodBody(createAccountSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAccountSchema)) dto: CreateAccountDto,
  ) {
    return this.accountsService.create(user.id, dto);
  }

  @Get()
  @ApiZodQuery(listAccountsQuerySchema)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listAccountsQuerySchema)) query: ListAccountsQueryDto,
  ) {
    return this.accountsService.list(user.id, query);
  }

  @Patch(':id')
  @ApiZodBody(updateAccountSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAccountSchema)) dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(user.id, id, dto);
  }

  @Delete(':id')
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.accountsService.archive(user.id, id);
  }

  @Patch(':id/restore')
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.accountsService.restore(user.id, id);
  }
}
