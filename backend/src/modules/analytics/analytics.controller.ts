import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiZodQuery } from '../../common/swagger/api-zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AnalyticsService } from './analytics.service';
import {
  DailySeriesQueryDto,
  dailySeriesQuerySchema,
  MonthlySeriesQueryDto,
  monthlySeriesQuerySchema,
  MonthlySummaryQueryDto,
  monthlySummaryQuerySchema,
} from './dto/analytics.dto';

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
    @Query(new ZodValidationPipe(monthlySummaryQuerySchema))
    query: MonthlySummaryQueryDto,
  ) {
    return this.analyticsService.getMonthlySummary(
      user.id,
      query.year,
      query.month,
      query.refresh,
      query.accountId,
      query.currency,
    );
  }

  @Get('monthly-series')
  @ApiZodQuery(monthlySeriesQuerySchema)
  monthlySeries(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(monthlySeriesQuerySchema))
    query: MonthlySeriesQueryDto,
  ) {
    return this.analyticsService.getMonthlySeries(
      user.id,
      query.months,
      query.currency,
      query.accountId,
    );
  }

  /** Income, expenses and closing balance per day (the app's weekly chart). */
  @Get('daily-series')
  @ApiZodQuery(dailySeriesQuerySchema)
  dailySeries(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(dailySeriesQuerySchema))
    query: DailySeriesQueryDto,
  ) {
    return this.analyticsService.getDailySeries(
      user.id,
      query.from,
      query.days,
      query.currency,
      query.accountId,
      query.tz,
    );
  }
}
