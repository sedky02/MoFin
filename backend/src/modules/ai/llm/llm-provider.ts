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
  /** JSON Schema for the arguments object. */
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
 * The seam between MoFin and a model vendor. Abstract class (not an interface)
 * so it can be a Nest injection token. One implementation today, for any
 * OpenAI-compatible endpoint; a native adapter for another API can slot in
 * behind the same shape.
 */
export abstract class LlmProvider {
  /** False when no API key is configured: callers use their fallback. */
  abstract readonly enabled: boolean;
  abstract chat(request: LlmChatRequest): Promise<LlmCompletion>;
}
