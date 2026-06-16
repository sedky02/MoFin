import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AiService } from './ai.service';
import { ParseTransactionIntentDto, parseTransactionIntentSchema } from './dto/ai.dto';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('transaction-intents')
  parse(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(parseTransactionIntentSchema)) dto: ParseTransactionIntentDto,
  ) {
    return this.aiService.createDraftFromNaturalLanguage(user.id, dto);
  }
}
