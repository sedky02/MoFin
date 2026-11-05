import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { AiChatsService } from './chat/ai-chats.service';
import {
  ListChatsQueryDto,
  ParseTransactionIntentDto,
  RenameChatDto,
  SendChatMessageDto,
  listChatsQuerySchema,
  parseTransactionIntentSchema,
  renameChatSchema,
  sendChatMessageSchema,
} from './dto/ai.dto';

// Each question is up to 5 model calls; the provider's free tier is small.
const CHAT_THROTTLE = { default: { limit: 15, ttl: 60_000 } };

@ApiTags('ai')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly chatService: AiChatService,
    private readonly chats: AiChatsService,
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

  /** The user's saved chats, most recently active first. */
  @Get('chats')
  listChats(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listChatsQuerySchema))
    query: ListChatsQueryDto,
  ) {
    return this.chats.list(user.id, query);
  }

  /** Starts a chat with its first question; returns the chat and both saved turns. */
  @DemoQuota('ai-chat')
  @Throttle(CHAT_THROTTLE)
  @Post('chats')
  @ApiZodBody(sendChatMessageSchema)
  startChat(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(sendChatMessageSchema)) dto: SendChatMessageDto,
  ) {
    return this.chatService.send(user.id, null, dto);
  }

  /** A chat with every message, oldest first. */
  @Get('chats/:id')
  getChat(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.chats.get(user.id, id);
  }

  /** Read-only Q&A over the user's own data, in the context of this chat. */
  @DemoQuota('ai-chat')
  @Throttle(CHAT_THROTTLE)
  @Post('chats/:id/messages')
  @ApiZodBody(sendChatMessageSchema)
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendChatMessageSchema)) dto: SendChatMessageDto,
  ) {
    return this.chatService.send(user.id, id, dto);
  }

  @Patch('chats/:id')
  @ApiZodBody(renameChatSchema)
  renameChat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(renameChatSchema)) dto: RenameChatDto,
  ) {
    return this.chats.rename(user.id, id, dto.title);
  }

  @Delete('chats/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteChat(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.chats.remove(user.id, id);
  }
}
