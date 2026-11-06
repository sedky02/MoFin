import { LlmMessage } from '../llm/llm-provider';

/**
 * A running summary of older messages plus the recent ones verbatim; the free provider tiers are
 * small (about 8k tokens a minute), so every part has a budget.
 */

/** Messages always sent verbatim (3 back-and-forths). */
export const RECENT_MESSAGES = 6;
/**
 * Older messages fold into the summary in batches of at least this many, so it costs a model call
 * every couple of turns, not every turn. Until then they stay verbatim.
 */
export const SUMMARY_BATCH = 4;
/** Character budget for the verbatim history (about 3k tokens). */
export const HISTORY_CHAR_BUDGET = 12_000;
/** An old message over the budget is shortened to this many characters. */
export const SHORTENED_MESSAGE_CHARS = 400;
/** Character budget for tool results inside one answer (about 3.5k tokens). */
export const TOOL_RESULTS_CHAR_BUDGET = 14_000;
/** A saved chat holds at most this many messages; then the user starts a new one. */
export const MAX_MESSAGES_PER_CHAT = 200;

export interface StoredMessage {
  role: 'USER' | 'ASSISTANT';
  content: string;
  /** Titles of the charts an assistant turn showed, so the model knows. */
  chartTitles?: string[];
}

function asLlm(message: StoredMessage): LlmMessage {
  if (message.role === 'USER')
    return { role: 'user', content: message.content };
  const charts = message.chartTitles?.length
    ? `\n[Charts shown: ${message.chartTitles.join('; ')}]`
    : '';
  return { role: 'assistant', content: `${message.content}${charts}` };
}

/**
 * Every message the summary doesn't cover; over budget the oldest are shortened (never the newest),
 * so long messages can't push the request past the provider limit.
 */
export function historyMessages(
  messages: StoredMessage[],
  summarizedCount: number,
): LlmMessage[] {
  const recent = messages.slice(summarizedCount).map(asLlm);
  let total = recent.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
  for (let i = 0; i < recent.length - 1 && total > HISTORY_CHAR_BUDGET; i++) {
    const content = recent[i].content ?? '';
    if (content.length <= SHORTENED_MESSAGE_CHARS) continue;
    const shortened = `${content.slice(0, SHORTENED_MESSAGE_CHARS)}… (shortened)`;
    total -= content.length - shortened.length;
    recent[i] = { ...recent[i], content: shortened };
  }
  return recent;
}

/**
 * [from, to) to fold into the summary after a turn, or null when not worth a model call; always
 * leaves the last RECENT_MESSAGES verbatim.
 */
export function summaryRange(
  totalMessages: number,
  summarizedCount: number,
): { from: number; to: number } | null {
  const to = totalMessages - RECENT_MESSAGES;
  if (to - summarizedCount < SUMMARY_BATCH) return null;
  return { from: summarizedCount, to };
}

const DROPPED_RESULT = JSON.stringify({
  truncated: true,
  note: 'Earlier result dropped to save space. Call the tool again if you still need it.',
});

/**
 * Replaces the oldest tool results with a short note to stay within TOOL_RESULTS_CHAR_BUDGET: each
 * round re-sends every earlier result. Mutates `messages`; the newest is kept.
 */
export function trimToolResults(messages: LlmMessage[]): void {
  const tools = messages.filter((m) => m.role === 'tool');
  let total = tools.reduce((sum, m) => sum + m.content.length, 0);
  for (const message of tools.slice(0, -1)) {
    if (total <= TOOL_RESULTS_CHAR_BUDGET) return;
    if (message.content === DROPPED_RESULT) continue;
    total -= message.content.length - DROPPED_RESULT.length;
    message.content = DROPPED_RESULT;
  }
}

export function titleFrom(content: string): string {
  const line = content.trim().split('\n')[0].replace(/\s+/g, ' ');
  if (line.length <= 60) return line;
  const cut = line.slice(0, 60);
  const space = cut.lastIndexOf(' ');
  return `${(space > 30 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
