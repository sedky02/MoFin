import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { GetBalanceQueryDto } from './dto/ledger.dto';
import { LedgerService } from './ledger.service';

@UseGuards(JwtAuthGuard)
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get('balance')
  getBalance(@CurrentUser() user: AuthenticatedUser, @Query() query: GetBalanceQueryDto) {
    return this.ledgerService.getBalance(user.id, query);
  }
}
