import { Logger } from '@nestjs/common';
import {
  AiProviderRejectedException,
  AiUnavailableException,
} from './ai-unavailable.exception';
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

interface ProviderError {
  status: number;
  code: string;
  message: string;
  /**
   * Groq's failed_generation for tool_use_failed: used only to repair the call; never logged, since
   * it can carry ids and amounts.
   */
  failedGeneration?: string;
}

/**
 * The provider's own error code and message, capped: they describe the failure, not our prompt or
 * the reply, so they are safe to log.
 */
async function readProviderError(response: Response): Promise<ProviderError> {
  try {
    const body = (await response.json()) as {
      error?: {
        code?: string;
        type?: string;
        message?: string;
        failed_generation?: unknown;
      };
    };
    const { code, type, message, failed_generation } = body.error ?? {};
    return {
      status: response.status,
      code: code ?? type ?? 'no_code',
      message: (message ?? 'no message').slice(0, 300),
      failedGeneration:
        typeof failed_generation === 'string' ? failed_generation : undefined,
    };
  } catch {
    return {
      status: response.status,
      code: 'unreadable',
      message: 'unreadable error body',
    };
  }
}

/**
 * Rebuilds a tool call with one known slip: a stray quote after a number (`"month":11"`, seen from
 * gpt-oss on Groq). Anything else returns null; arguments still go through the tool's Zod schema.
 */
export function repairToolCall(
  failedGeneration: string,
): { name: string; arguments: string } | null {
  // `11"` before a comma or closing brace was meant to be `11`.
  const fixed = failedGeneration.replace(
    /(:\s*-?\d+(?:\.\d+)?)"(?=\s*[,}])/g,
    '$1',
  );
  // The arguments object sometimes ends with a stray `"` too (`}"}`). Only tried when the
  // text doesn't parse as is: arguments sent as a JSON string legitimately end that way.
  const candidates = [fixed, fixed.replace(/\}"\s*\}\s*$/, '}}')];
  for (const candidate of candidates) {
    const call = parseToolCall(candidate);
    if (call) return call;
  }
  return null;
}

function parseToolCall(
  text: string,
): { name: string; arguments: string } | null {
  try {
    const parsed = JSON.parse(text) as { name?: unknown; arguments?: unknown };
    if (typeof parsed.name !== 'string' || !parsed.name) return null;
    const args =
      typeof parsed.arguments === 'string'
        ? (JSON.parse(parsed.arguments) as unknown)
        : parsed.arguments;
    if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
    return { name: parsed.name, arguments: JSON.stringify(args) };
  } catch {
    return null;
  }
}

/** Seconds from a Retry-After header (seconds or an HTTP date), capped at 5 minutes. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  const value = Number.isFinite(seconds)
    ? seconds
    : (Date.parse(header) - Date.now()) / 1000;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(Math.ceil(value), 300);
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
 * Plain-fetch client for any OpenAI-shaped endpoint; never logs prompts or replies. Retryable
 * failures are 503, other 4xx are our bug (502); Groq's tool_use_failed gets one retry.
 */
export const RETRY_TEMPERATURE = 0.7;

export class OpenAiCompatibleProvider extends LlmProvider {
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);

  constructor(private readonly options: OpenAiCompatibleOptions) {
    super();
    // One line per cold start, so a bad deployment config shows up in the logs.
    // Reports only whether the key is present and well-formed, never the key.
    const key = options.apiKey;
    this.logger.log(
      `LLM config: key ${key ? 'set' : 'MISSING'}` +
        `${key && key !== key.trim() ? ' (has surrounding whitespace)' : ''}` +
        `${key && /^["']|["']$/.test(key.trim()) ? ' (wrapped in quotes)' : ''}` +
        `, base ${options.baseUrl}, model ${options.model}, timeout ${options.timeoutMs}ms`,
    );
  }

  get enabled(): boolean {
    return Boolean(this.options.apiKey);
  }

  async chat(request: LlmChatRequest): Promise<LlmCompletion> {
    if (!this.enabled) throw new AiUnavailableException();

    const body = (temperature: number) =>
      JSON.stringify({
        model: this.options.model,
        messages: request.messages.map(toWireMessage),
        temperature,
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
      });

    const base = request.temperature ?? 0.2;
    for (let attempt = 1; ; attempt++) {
      const started = Date.now();
      // The retry after a tool_use_failed runs warmer: the same request at the same low
      // temperature tends to repeat the same broken JSON (seen: `"month":11"`).
      const response = await this.send(
        body(attempt === 1 ? base : Math.max(base, RETRY_TEMPERATURE)),
      );
      if (response.ok) {
        const json = (await response.json()) as ChatCompletionResponse;
        const message = json.choices?.[0]?.message;
        const toolCalls = (message?.tool_calls ?? []).map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        }));
        this.logger.log(
          `LLM call ok in ${Date.now() - started}ms: ${json.usage?.total_tokens ?? '?'} tokens, ` +
            `${request.messages.length} messages, ${request.tools?.length ?? 0} tools offered, ${toolCalls.length} called`,
        );
        return {
          content: message?.content ?? null,
          toolCalls,
          totalTokens: json.usage?.total_tokens,
        };
      }

      const error = await readProviderError(response);
      if (error.code === 'tool_use_failed' && error.failedGeneration) {
        const repaired = repairToolCall(error.failedGeneration);
        if (repaired) {
          this.logger.warn(
            `LLM tool call for ${repaired.name} had malformed JSON; repaired it`,
          );
          return {
            content: null,
            toolCalls: [{ id: `repaired-${Date.now()}`, ...repaired }],
          };
        }
      }
      const retryable =
        error.status === 400 && error.code === 'tool_use_failed' && attempt < 2;
      const log = `LLM provider answered ${error.status} (model ${this.options.model}, tools ${request.tools?.length ?? 0}, attempt ${attempt}): ${error.code}: ${error.message}`;
      if (retryable) {
        this.logger.warn(`${log}; retrying`);
        continue;
      }
      if (error.status === 429) {
        this.logger.warn(log);
        throw new AiUnavailableException(
          'The assistant is busy. Try again in a minute.',
          parseRetryAfter(response.headers.get('retry-after')) ?? 30,
        );
      }
      this.logger.error(log);
      if (error.status === 413) {
        throw new AiUnavailableException(
          'That question needs more room than the assistant has right now. Try a shorter question or a new chat.',
          60,
        );
      }
      if (error.status >= 500) throw new AiUnavailableException();
      if (error.code === 'tool_use_failed') {
        throw new AiUnavailableException(
          'The assistant got confused. Try rephrasing the question.',
        );
      }
      throw new AiProviderRejectedException();
    }
  }

  private async send(body: string): Promise<Response> {
    try {
      return await fetch(`${this.options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body,
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      // Timeouts are a TimeoutError; DNS/TLS/connection failures carry the
      // reason in `cause` (ENOTFOUND, ECONNREFUSED, ...).
      const name = error instanceof Error ? error.name : 'unknown';
      const cause = (error as { cause?: { code?: string; message?: string } })
        ?.cause;
      this.logger.error(
        `LLM request failed: ${name}` +
          `${error instanceof Error ? `: ${error.message}` : ''}` +
          `${cause ? ` (cause ${cause.code ?? cause.message ?? 'unknown'})` : ''}`,
      );
      throw new AiUnavailableException(
        name === 'TimeoutError'
          ? 'The assistant took too long to answer.'
          : 'The assistant is unavailable right now.',
      );
    }
  }
}
