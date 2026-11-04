import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DemoQuota } from '../../common/decorators/demo.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiZodBody } from '../../common/swagger/api-zod';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AiChatService } from './ai-chat.service';
import { AiService } from './ai.service';
import {
  AiChatDto,
  ParseTransactionIntentDto,
  aiChatSchema,
  parseTransactionIntentSchema,
} from './dto/ai.dto';

@ApiTags('ai')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly chatService: AiChatService,
  ) {}

  /** Creates one PENDING draft per transaction found in the sentence. */
  @DemoQuota('ai-drafts')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('transaction-intents')
  @ApiZodBody(parseTransactionIntentSchema)
  parse(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(parseTransactionIntentSchema))
    dto: ParseTransactionIntentDto,
  ) {
    return this.aiService.createDraftsFromNaturalLanguage(user.id, dto);
  }

  /** Read-only Q&A over the user's own data. Stateless: the client sends the conversation. */
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('chat')
  @ApiZodBody(aiChatSchema)
  chat(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(aiChatSchema)) dto: AiChatDto,
  ) {
    return this.chatService.chat(user, dto);
  }
}
