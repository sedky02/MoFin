import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiCredentialsService } from '../credentials/ai-credentials.service';
import { AiUnavailableException } from './ai-unavailable.exception';
import { FallbackLlmProvider } from './fallback-llm.provider';
import { LlmProvider } from './llm-provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { PROVIDER_PRESETS } from './provider-presets';

/**
 * Picks who answers a person's request: their own key when they chose one (with the shared key
 * behind it unless they turned that off), otherwise the shared key. Built per request, so a
 * decrypted key lives only as long as the request does.
 */
@Injectable()
export class LlmResolver {
  private readonly logger = new Logger(LlmResolver.name);

  constructor(
    private readonly shared: LlmProvider,
    private readonly credentials: AiCredentialsService,
    private readonly config: ConfigService,
  ) {}

  async forUser(userId: string): Promise<LlmProvider> {
    const active = await this.credentials.activeKey(userId);
    if (!active) return this.shared;

    const canFallBack = active.fallbackEnabled && this.shared.enabled;
    if (!active.apiKey) {
      if (canFallBack) return this.shared;
      throw new AiUnavailableException(
        'Your saved API key could not be read. Add it again in Settings > AI provider.',
      );
    }

    const preset = PROVIDER_PRESETS[active.provider];
    const own = new OpenAiCompatibleProvider({
      apiKey: active.apiKey,
      baseUrl: preset.baseUrl,
      model: active.model,
      timeoutMs: this.config.getOrThrow<number>('AI_TIMEOUT_MS'),
      origin: 'user',
      providerLabel: preset.label,
      tokenLimitParam: preset.tokenLimitParam,
      sendTemperature: preset.sendTemperature,
    });
    this.logger.debug(`Answering with the person's own ${active.provider} key`);
    return canFallBack ? new FallbackLlmProvider(own, this.shared) : own;
  }
}
