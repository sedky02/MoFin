/**
 * Sends the real chat request (system prompt shape + the chat tools) through
 * OpenAiCompatibleProvider and prints the provider's status and error body.
 *
 *   AI_API_KEY=... npx ts-node scripts/ai-chat-probe.ts
 *
 * AI_BASE_URL and AI_MODEL default to the app's defaults. Prints no key.
 */
import { buildChatTools } from '../src/modules/ai/ai-chat-tools';
import { OpenAiCompatibleProvider } from '../src/modules/ai/llm/openai-compatible.provider';

async function main() {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new Error('Set AI_API_KEY');

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await realFetch(...args);
    console.log('HTTP', res.status);
    if (!res.ok) console.log('BODY', await res.clone().text());
    return res;
  };

  const provider = new OpenAiCompatibleProvider({
    apiKey,
    baseUrl: (
      process.env.AI_BASE_URL ?? 'https://api.groq.com/openai/v1'
    ).replace(/\/+$/, ''),
    model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b',
    timeoutMs: 30_000,
  });

  try {
    const out = await provider.chat({
      messages: [
        {
          role: 'system',
          content: 'You answer questions about finances using tools.',
        },
        { role: 'user', content: 'How much did I spend this month?' },
      ],
      tools: buildChatTools(),
      maxTokens: 900,
    });
    console.log('OK', JSON.stringify(out).slice(0, 300));
  } catch (e) {
    console.log('THROWN', e instanceof Error ? e.message : e);
  }
}
void main();
