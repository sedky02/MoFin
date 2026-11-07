import { Logger } from '@nestjs/common';
import { isAiProviderFailure } from './ai-unavailable.exception';
import { LlmChatRequest, LlmCompletion, LlmProvider } from './llm-provider';

/**
 * Tries the person's own key; if its provider fails, the shared one answers instead, once per
 * request. Only called when they left the fallback on.
 */
export class FallbackLlmProvider extends LlmProvider {
  private readonly logger = new Logger(FallbackLlmProvider.name);
  private fellBack = false;

  constructor(
    private readonly own: LlmProvider,
    private readonly shared: LlmProvider,
  ) {
    super();
  }

  get enabled(): boolean {
    return this.own.enabled || this.shared.enabled;
  }

  override get usedSharedFallback(): boolean {
    return this.fellBack;
  }

  async chat(request: LlmChatRequest): Promise<LlmCompletion> {
    if (!this.fellBack) {
      try {
        return await this.own.chat(request);
      } catch (error) {
        if (!isAiProviderFailure(error)) throw error;
        // The code says why, the message may name the person's provider; neither holds the key.
        this.logger.warn(
          `A person's own AI key failed (${(error.getResponse() as { code?: string }).code ?? 'unknown'}); using the shared one`,
        );
        this.fellBack = true;
      }
    }
    return this.shared.chat(request);
  }
}
