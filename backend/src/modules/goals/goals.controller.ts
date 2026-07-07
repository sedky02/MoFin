import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiZodBody, ApiZodQuery } from '../../common/swagger/api-zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  CreateGoalDto,
  ListGoalsQueryDto,
  UpdateGoalDto,
  createGoalSchema,
  listGoalsQuerySchema,
  updateGoalSchema,
} from './dto/goals.dto';
import { GoalsService } from './goals.service';

@ApiTags('goals')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  @ApiZodBody(createGoalSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createGoalSchema)) dto: CreateGoalDto,
  ) {
    return this.goalsService.create(user.id, dto);
  }

  @Get()
  @ApiZodQuery(listGoalsQuerySchema)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listGoalsQuerySchema)) query: ListGoalsQueryDto,
  ) {
    return this.goalsService.list(user.id, query.status);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.goalsService.findOne(user.id, id);
  }

  @Get(':id/history')
  history(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.goalsService.history(user.id, id);
  }

  @Patch(':id')
  @ApiZodBody(updateGoalSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateGoalSchema)) dto: UpdateGoalDto,
  ) {
    return this.goalsService.update(user.id, id, dto);
  }

  @Delete(':id')
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.goalsService.archive(user.id, id);
  }
}
