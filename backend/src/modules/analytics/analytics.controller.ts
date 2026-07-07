import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiZodQuery } from '../../common/swagger/api-zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AnalyticsService } from './analytics.service';
import { MonthlySummaryQueryDto, monthlySummaryQuerySchema } from './dto/analytics.dto';

@ApiTags('analytics')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('monthly-summary')
  @ApiZodQuery(monthlySummaryQuerySchema)
  monthlySummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(monthlySummaryQuerySchema)) query: MonthlySummaryQueryDto,
  ) {
    return this.analyticsService.getMonthlySummary(user.id, query.year, query.month, query.refresh, query.accountId);
  }
}
