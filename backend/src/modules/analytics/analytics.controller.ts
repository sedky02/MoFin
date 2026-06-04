import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AnalyticsService } from './analytics.service';
import { MonthlySummaryQueryDto } from './dto/analytics.dto';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('monthly-summary')
  monthlySummary(@CurrentUser() user: AuthenticatedUser, @Query() query: MonthlySummaryQueryDto) {
    return this.analyticsService.getMonthlySummary(user.id, query.year, query.month, Boolean(query.refresh));
  }
}
