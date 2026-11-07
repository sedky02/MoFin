import { Logger } from '@nestjs/common';
import {
  AiKeyRejectedException,
  AiProviderRejectedException,
} from './ai-unavailable.exception';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

const SECRET = 'sk-user-secret-123456';
const OK = {
  choices: [{ message: { content: 'hi', tool_calls: [] } }],
};
const request = { messages: [{ role: 'user' as const, content: 'hi' }] };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

function own(overrides: Record<string, unknown> = {}) {
  return new OpenAiCompatibleProvider({
    apiKey: SECRET,
    baseUrl: 'https://llm.test/v1',
    model: 'm',
    timeoutMs: 1000,
    origin: 'user',
    providerLabel: 'OpenAI',
    ...overrides,
  });
}

describe("OpenAiCompatibleProvider with a person's own key", () => {
  let fetchMock: jest.SpyInstance;
  let logged: string[];

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
    logged = [];
    for (const level of ['log', 'warn', 'error', 'debug'] as const) {
      jest
        .spyOn(Logger.prototype, level)
        .mockImplementation((...args: unknown[]) => {
          logged.push(args.map(String).join(' '));
        });
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it('treats a refused key as theirs to fix, not as our bug', async () => {
    for (const status of [401, 403]) {
      fetchMock.mockResolvedValueOnce(
        json(status, {
          error: {
            code: 'invalid_api_key',
            message: `Incorrect key ${SECRET}`,
          },
        }),
      );
      await expect(own().chat(request)).rejects.toBeInstanceOf(
        AiKeyRejectedException,
      );
    }
  });

  it('keeps a refused shared key as our own problem', async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: 'x', message: 'x' } }),
    );
    await expect(
      own({ origin: 'shared' }).chat(request),
    ).rejects.toBeInstanceOf(AiProviderRejectedException);
  });

  it('never writes the key, or what the provider said about it, to the log', async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, {
        error: {
          code: 'invalid_api_key',
          message: `Incorrect API key provided: ${SECRET}`,
        },
      }),
    );
    await own()
      .chat(request)
      .catch(() => undefined);
    fetchMock.mockResolvedValueOnce(json(200, OK));
    await own().chat(request);
    expect(logged.join('\n')).not.toContain(SECRET);
    expect(logged.join('\n')).not.toContain('Incorrect API key');
    expect(logged.some((line) => line.includes('invalid_api_key'))).toBe(true);
  });

  it('refuses to follow a redirect, so the key cannot be forwarded to another host', async () => {
    fetchMock.mockResolvedValueOnce(json(200, OK));
    await own().chat(request);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  });

  it("sends the key only to the provider's chat endpoint", async () => {
    fetchMock.mockResolvedValueOnce(json(200, OK));
    await own().chat(request);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://llm.test/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${SECRET}`,
    );
  });

  it('speaks the dialect the provider needs: token limit name and no custom temperature', async () => {
    fetchMock.mockResolvedValueOnce(json(200, OK));
    await own({
      tokenLimitParam: 'max_completion_tokens',
      sendTemperature: false,
    }).chat({
      ...request,
      maxTokens: 300,
      temperature: 0,
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body.max_completion_tokens).toBe(300);
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('temperature');
  });
});
