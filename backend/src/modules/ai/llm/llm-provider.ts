export interface LlmToolCall {
  id: string;
  name: string;
  /** Raw JSON string, exactly as the model produced it. Parse before use. */
  arguments: string;
}

export type LlmMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: LlmToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmChatRequest {
  messages: LlmMessage[];
  tools?: LlmTool[];
  /** Ask for a single JSON object as the reply (no tools in the same call). */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmCompletion {
  content: string | null;
  toolCalls: LlmToolCall[];
  totalTokens?: number;
}

/**
 * Abstract class so it can be a Nest injection token; one OpenAI-compatible implementation today,
 * others can slot in behind the same shape.
 */
export abstract class LlmProvider {
  /** False when no API key is configured: callers use their fallback. */
  abstract readonly enabled: boolean;
  /** True once a request meant for the person's own key was answered by the shared one. */
  get usedSharedFallback(): boolean {
    return false;
  }
  abstract chat(request: LlmChatRequest): Promise<LlmCompletion>;
}
