import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountsModule } from '../accounts/accounts.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CategoriesModule } from '../categories/categories.module';
import { DraftTransactionsModule } from '../draft-transactions/draft-transactions.module';
import { McpModule } from '../mcp/mcp.module';
import { AiChatService } from './ai-chat.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiChatsService } from './chat/ai-chats.service';
import { ChatToolRunner } from './chat/chat-tool-runner';
import { ModelDraftParser } from './drafts/model-draft-parser';
import { SecretBox } from '../../common/utils/secret-box';
import { AiCredentialsController } from './credentials/ai-credentials.controller';
import {
  AI_SECRET_BOX,
  AiCredentialsService,
} from './credentials/ai-credentials.service';
import { LlmProvider } from './llm/llm-provider';
import { LlmResolver } from './llm/llm-resolver';
import { OpenAiCompatibleProvider } from './llm/openai-compatible.provider';

@Module({
  imports: [
    DraftTransactionsModule,
    AccountsModule,
    AnalyticsModule,
    CategoriesModule,
    McpModule,
  ],
  controllers: [AiController, AiCredentialsController],
  providers: [
    AiService,
    ModelDraftParser,
    AiChatService,
    AiChatsService,
    ChatToolRunner,
    AiCredentialsService,
    LlmResolver,
    {
      provide: AI_SECRET_BOX,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const key = config.get<string>('AI_KEY_ENCRYPTION_KEY');
        return key ? new SecretBox(key) : null;
      },
    },
    {
      provide: LlmProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new OpenAiCompatibleProvider({
          apiKey: config.get<string>('AI_API_KEY'),
          baseUrl: config.getOrThrow<string>('AI_BASE_URL').replace(/\/+$/, ''),
          model: config.getOrThrow<string>('AI_MODEL'),
          timeoutMs: config.getOrThrow<number>('AI_TIMEOUT_MS'),
        }),
    },
  ],
  exports: [AiService],
})
export class AiModule {}
