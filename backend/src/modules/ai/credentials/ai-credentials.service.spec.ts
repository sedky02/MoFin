import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { SecretBox } from '../../../common/utils/secret-box';
import { AiCredentialsService } from './ai-credentials.service';

const SECRET = 'sk-test-abcdef123456';

interface Row {
  userId: string;
  provider: string;
  ciphertext: string;
  last4: string;
  model: string | null;
  verifiedAt: Date;
}

function setup({
  box = new SecretBox(randomBytes(32).toString('base64')),
}: { box?: SecretBox | null } = {}) {
  const rows: Row[] = [];
  const user = { aiProvider: null as string | null, aiFallbackEnabled: true };
  const prisma = {
    aiCredential: {
      findMany: jest.fn(async ({ where }: { where: { userId: string } }) =>
        rows.filter((r) => r.userId === where.userId),
      ),
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { userId_provider: { userId: string; provider: string } };
        }) =>
          rows.find(
            (r) =>
              r.userId === where.userId_provider.userId &&
              r.provider === where.userId_provider.provider,
          ) ?? null,
      ),
      count: jest.fn(
        async ({ where }: { where: { userId: string; provider: string } }) =>
          rows.filter(
            (r) => r.userId === where.userId && r.provider === where.provider,
          ).length,
      ),
      upsert: jest.fn(
        async ({ create, update }: { create: Row; update: Partial<Row> }) => {
          const existing = rows.find(
            (r) => r.userId === create.userId && r.provider === create.provider,
          );
          if (existing) Object.assign(existing, update);
          else rows.push({ ...create });
        },
      ),
      deleteMany: jest.fn(
        async ({ where }: { where: { userId: string; provider: string } }) => {
          const keep = rows.filter(
            (r) =>
              !(r.userId === where.userId && r.provider === where.provider),
          );
          rows.splice(0, rows.length, ...keep);
        },
      ),
    },
    user: {
      findUniqueOrThrow: jest.fn(async () => ({ ...user })),
      findUnique: jest.fn(async () => ({ ...user })),
      update: jest.fn(async ({ data }: { data: Partial<typeof user> }) => {
        Object.assign(user, data);
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { aiProvider: string | null };
          data: Partial<typeof user>;
        }) => {
          if (user.aiProvider === where.aiProvider) Object.assign(user, data);
        },
      ),
    },
  };
  const service = new AiCredentialsService(prisma as never, box);
  return { service, rows, user, prisma };
}

const offered = (...ids: string[]) =>
  new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), {
    status: 200,
  });

describe('AiCredentialsService', () => {
  let fetchMock: jest.SpyInstance;
  let logged: string[];
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
    logged = [];
    for (const level of ['log', 'warn', 'error'] as const) {
      jest
        .spyOn(Logger.prototype, level)
        .mockImplementation((...args: unknown[]) => {
          logged.push(args.map(String).join(' '));
        });
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it('checks the key with the provider, stores only ciphertext and the last four characters', async () => {
    fetchMock.mockResolvedValue(offered('openai/gpt-oss-120b'));
    const { service, rows } = setup();
    const result = await service.saveKey('u1', 'groq', { apiKey: SECRET });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.groq.com/openai/v1/models',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].ciphertext).not.toContain(SECRET);
    expect(rows[0].last4).toBe('3456');
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(result.providers.find((p) => p.provider === 'groq')).toMatchObject({
      connected: true,
      last4: '3456',
    });
  });

  it('never lets the key into a response, an overview or the log', async () => {
    fetchMock.mockResolvedValue(offered('openai/gpt-oss-120b'));
    const { service } = setup();
    const saved = await service.saveKey('u1', 'groq', { apiKey: SECRET });
    const overview = await service.overview('u1');
    expect(JSON.stringify([saved, overview, logged])).not.toContain(SECRET);
  });

  it('makes the first key the active one, and leaves the choice alone after that', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(offered('openai/gpt-oss-120b', 'gpt-6-luna')),
    );
    const { service, user } = setup();
    await service.saveKey('u1', 'groq', { apiKey: SECRET });
    expect(user.aiProvider).toBe('groq');
    await service.saveKey('u1', 'openai', { apiKey: SECRET });
    expect(user.aiProvider).toBe('groq');
  });

  it('stores nothing when the provider rejects the key', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    const { service, rows } = setup();
    await expect(
      service.saveKey('u1', 'groq', { apiKey: SECRET }),
    ).rejects.toMatchObject({
      response: { code: 'AI_KEY_INVALID' },
    });
    expect(rows).toHaveLength(0);
  });

  it('stores nothing when the provider does not offer the model', async () => {
    fetchMock.mockResolvedValue(offered('something-else'));
    const { service, rows } = setup();
    await expect(
      service.saveKey('u1', 'groq', { apiKey: SECRET }),
    ).rejects.toMatchObject({
      response: { code: 'AI_MODEL_UNAVAILABLE' },
    });
    expect(rows).toHaveLength(0);
  });

  it('accepts a model the provider offers and remembers it', async () => {
    fetchMock.mockResolvedValue(offered('models/gemini-x'));
    const { service, rows } = setup();
    await service.saveKey('u1', 'gemini', {
      apiKey: SECRET,
      model: 'gemini-x',
    });
    expect(rows[0].model).toBe('gemini-x');
  });

  it('reports an unreachable provider as a retryable error, not a bad key', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const { service } = setup();
    await expect(
      service.saveKey('u1', 'groq', { apiKey: SECRET }),
    ).rejects.toMatchObject({
      status: 503,
    });
  });

  it('does not accept a key when this server cannot encrypt', async () => {
    const { service, rows } = setup({ box: null });
    await expect(
      service.saveKey('u1', 'groq', { apiKey: SECRET }),
    ).rejects.toMatchObject({
      response: { code: 'AI_KEYS_NOT_CONFIGURED' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
    expect((await service.overview('u1')).available).toBe(false);
  });

  it('gives back the key only through activeKey, with the model and fallback choice', async () => {
    fetchMock.mockResolvedValue(offered('gpt-6-luna'));
    const { service } = setup();
    await service.saveKey('u1', 'openai', { apiKey: SECRET });
    await expect(service.activeKey('u1')).resolves.toEqual({
      provider: 'openai',
      apiKey: SECRET,
      model: 'gpt-6-luna',
      fallbackEnabled: true,
    });
  });

  it('has no active key for someone who uses the shared one', async () => {
    const { service } = setup();
    await expect(service.activeKey('u1')).resolves.toBeNull();
  });

  it('reports an unreadable stored key without throwing or logging it', async () => {
    fetchMock.mockResolvedValue(offered('openai/gpt-oss-120b'));
    const { service, rows } = setup();
    await service.saveKey('u1', 'groq', { apiKey: SECRET });
    rows[0].ciphertext = 'v1.AAAA.BBBB.CCCC';
    await expect(service.activeKey('u1')).resolves.toMatchObject({
      apiKey: '',
    });
    expect(logged.join('\n')).not.toContain('CCCC');
  });

  it('refuses a key row moved to another user', async () => {
    fetchMock.mockResolvedValue(offered('openai/gpt-oss-120b'));
    const { service, rows, user } = setup();
    await service.saveKey('u1', 'groq', { apiKey: SECRET });
    rows[0].userId = 'u2';
    user.aiProvider = 'groq';
    await expect(service.activeKey('u2')).resolves.toMatchObject({
      apiKey: '',
    });
  });

  it('switches to another stored provider but not to one without a key', async () => {
    fetchMock.mockResolvedValue(offered('openai/gpt-oss-120b'));
    const { service, user } = setup();
    await service.saveKey('u1', 'groq', { apiKey: SECRET });
    await expect(
      service.updatePreferences('u1', { activeProvider: 'openai' }),
    ).rejects.toThrow('Add a key for that provider first');
    await service.updatePreferences('u1', {
      activeProvider: null,
      fallbackEnabled: false,
    });
    expect(user).toMatchObject({ aiProvider: null, aiFallbackEnabled: false });
  });

  it('goes back to the shared assistant when the active key is removed', async () => {
    fetchMock.mockResolvedValue(offered('openai/gpt-oss-120b'));
    const { service, user, rows } = setup();
    await service.saveKey('u1', 'groq', { apiKey: SECRET });
    await service.removeKey('u1', 'groq');
    expect(rows).toHaveLength(0);
    expect(user.aiProvider).toBeNull();
  });
});
