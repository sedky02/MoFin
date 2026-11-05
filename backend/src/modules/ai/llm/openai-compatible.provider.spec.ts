import {
  AiProviderRejectedException,
  AiUnavailableException,
} from './ai-unavailable.exception';
import {
  OpenAiCompatibleProvider,
  parseRetryAfter,
  repairToolCall,
  RETRY_TEMPERATURE,
} from './openai-compatible.provider';

const OK_BODY = {
  choices: [
    {
      message: {
        content: null,
        tool_calls: [
          {
            id: 'c1',
            function: { name: 'list_accounts', arguments: '{}' },
          },
        ],
      },
    },
  ],
  usage: { total_tokens: 42 },
};

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const providerError = (code: string, message = 'nope') => ({
  error: { code, message },
});

function provider(apiKey: string | null = 'key') {
  return new OpenAiCompatibleProvider({
    apiKey: apiKey ?? undefined,
    baseUrl: 'https://llm.test/v1',
    model: 'test-model',
    timeoutMs: 1000,
  });
}

const request = {
  messages: [{ role: 'user' as const, content: 'hi' }],
  tools: [{ name: 'list_accounts', description: 'd', parameters: {} }],
};

describe('OpenAiCompatibleProvider', () => {
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('sends the OpenAI wire format and reads tool calls back', async () => {
    fetchMock.mockResolvedValue(json(200, OK_BODY));

    const result = await provider().chat(request);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://llm.test/v1/chat/completions');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'test-model',
      tool_choice: 'auto',
      tools: [{ type: 'function', function: { name: 'list_accounts' } }],
    });
    expect(result).toEqual({
      content: null,
      toolCalls: [{ id: 'c1', name: 'list_accounts', arguments: '{}' }],
      totalTokens: 42,
    });
  });

  it('is disabled without a key and never calls out', async () => {
    const p = provider(null);
    expect(p.enabled).toBe(false);
    await expect(p.chat(request)).rejects.toBeInstanceOf(
      AiUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries a tool_use_failed once (the model slipped, not us)', async () => {
    fetchMock
      .mockResolvedValueOnce(json(400, providerError('tool_use_failed')))
      .mockResolvedValueOnce(json(200, OK_BODY));

    await expect(provider().chat(request)).resolves.toMatchObject({
      totalTokens: 42,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The same request at the same low temperature tends to repeat the slip.
    const temperatures = fetchMock.mock.calls.map(
      ([, init]) =>
        (
          JSON.parse((init as RequestInit).body as string) as {
            temperature: number;
          }
        ).temperature,
    );
    expect(temperatures).toEqual([0.2, RETRY_TEMPERATURE]);
  });

  it('repairs the stray-quote slip from failed_generation instead of failing', async () => {
    fetchMock.mockResolvedValue(
      json(400, {
        error: {
          code: 'tool_use_failed',
          message: 'Failed to parse tool call arguments as JSON',
          failed_generation:
            '{"name": "get_monthly_summary", "arguments": {"currency":"TND","month":11","year":2026}"}',
        },
      }),
    );

    const result = await provider().chat(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('get_monthly_summary');
    expect(JSON.parse(result.toolCalls[0].arguments)).toEqual({
      currency: 'TND',
      month: 11,
      year: 2026,
    });
  });

  it('gives up on a second tool_use_failed as retryable 503', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(json(400, providerError('tool_use_failed'))),
    );
    await expect(provider().chat(request)).rejects.toBeInstanceOf(
      AiUnavailableException,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps a 429 to 503 with the Retry-After the provider gave', async () => {
    fetchMock.mockResolvedValue(
      json(429, providerError('rate_limit_exceeded'), { 'retry-after': '12' }),
    );
    const error = (await provider()
      .chat(request)
      .catch((e: unknown) => e)) as AiUnavailableException;
    expect(error).toBeInstanceOf(AiUnavailableException);
    expect(error.retryAfterSeconds).toBe(12);
    expect(error.getResponse()).toMatchObject({
      code: 'AI_UNAVAILABLE',
      retryAfterSeconds: 12,
    });
  });

  it.each([500, 502, 503, 413])('treats %i as retryable (503)', async (s) => {
    fetchMock.mockResolvedValue(json(s, providerError('server')));
    await expect(provider().chat(request)).rejects.toBeInstanceOf(
      AiUnavailableException,
    );
  });

  it.each([
    [400, 'invalid_request_error'],
    [401, 'invalid_api_key'],
    [404, 'model_not_found'],
  ])(
    'treats %i %s as our own problem (502), not an outage',
    async (s, code) => {
      fetchMock.mockResolvedValue(json(s, providerError(code)));
      await expect(provider().chat(request)).rejects.toBeInstanceOf(
        AiProviderRejectedException,
      );
    },
  );

  it('reports a timeout as "took too long"', async () => {
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    fetchMock.mockRejectedValue(timeout);
    await expect(provider().chat(request)).rejects.toMatchObject({
      message: 'The assistant took too long to answer.',
    });
  });
});

describe('repairToolCall', () => {
  it('fixes only the stray quote after a number', () => {
    expect(repairToolCall('{"name":"x","arguments":{"a":1","b":"s"}}')).toEqual(
      { name: 'x', arguments: '{"a":1,"b":"s"}' },
    );
    expect(repairToolCall('{"name":"x","arguments":"{\\"a\\":2}"}')).toEqual({
      name: 'x',
      arguments: '{"a":2}',
    });
  });

  it('gives up on anything else', () => {
    expect(repairToolCall('not json at all')).toBeNull();
    expect(repairToolCall('{"arguments":{"a":1}}')).toBeNull();
    expect(repairToolCall('{"name":"x","arguments":[1]}')).toBeNull();
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates, capped at 5 minutes', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('7')).toBe(7);
    expect(parseRetryAfter('99999')).toBe(300);
    expect(parseRetryAfter('garbage')).toBeUndefined();
    const inTen = new Date(Date.now() + 10_000).toUTCString();
    expect(parseRetryAfter(inTen)).toBeGreaterThanOrEqual(9);
  });
});
