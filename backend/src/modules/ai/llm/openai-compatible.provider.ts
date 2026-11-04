import { Logger } from '@nestjs/common';
import { AiUnavailableException } from './ai-unavailable.exception';
import {
  LlmChatRequest,
  LlmCompletion,
  LlmMessage,
  LlmProvider,
} from './llm-provider';

export interface OpenAiCompatibleOptions {
  apiKey?: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage?: { total_tokens?: number };
}

function toWireMessage(message: LlmMessage) {
  switch (message.role) {
    case 'tool':
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content,
      };
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: call.arguments },
              })),
            }
          : {}),
      };
    default:
      return { role: message.role, content: message.content };
  }
}

/**
 * Talks to any `/chat/completions` endpoint that follows the OpenAI shape
 * (Groq, Gemini's compatibility endpoint, OpenRouter, OpenAI) with plain
 * `fetch`: no vendor SDK. Failures that are the provider's, not the caller's
 * (timeout, 429, 5xx, bad key) all surface as AI_UNAVAILABLE, and only the
 * status code is logged, never the prompt or the reply.
 */
export class OpenAiCompatibleProvider extends LlmProvider {
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);

  constructor(private readonly options: OpenAiCompatibleOptions) {
    super();
  }

  get enabled(): boolean {
    return Boolean(this.options.apiKey);
  }

  async chat(request: LlmChatRequest): Promise<LlmCompletion> {
    if (!this.enabled) throw new AiUnavailableException();

    const body = {
      model: this.options.model,
      messages: request.messages.map(toWireMessage),
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 1024,
      ...(request.json ? { response_format: { type: 'json_object' } } : {}),
      ...(request.tools?.length
        ? {
            tools: request.tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
            tool_choice: 'auto',
          }
        : {}),
    };

    let response: Response;
    try {
      response = await fetch(`${this.options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      this.logger.warn(
        `LLM request failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      throw new AiUnavailableException(
        'The assistant took too long to answer.',
      );
    }

    if (!response.ok) {
      this.logger.warn(`LLM provider answered ${response.status}`);
      throw new AiUnavailableException(
        response.status === 429
          ? 'The assistant is busy. Try again in a minute.'
          : 'The assistant is unavailable right now.',
      );
    }

    const json = (await response.json()) as ChatCompletionResponse;
    const message = json.choices?.[0]?.message;
    return {
      content: message?.content ?? null,
      toolCalls: (message?.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      })),
      totalTokens: json.usage?.total_tokens,
    };
  }
}
