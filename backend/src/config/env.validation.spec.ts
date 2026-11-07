import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/mofin',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_MCP_SECRET: 'b'.repeat(40),
  REFRESH_TOKEN_SECRET: 'c'.repeat(40),
};

const AI_KEY = Buffer.alloc(32, 7).toString('base64');

describe('validateEnv BFF_SHARED_SECRET', () => {
  it('is required in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /BFF_SHARED_SECRET: BFF_SHARED_SECRET is required in production/,
    );
  });

  it('is accepted in production when set', () => {
    const env = validateEnv({
      ...base,
      NODE_ENV: 'production',
      BFF_SHARED_SECRET: 'd'.repeat(40),
      AI_KEY_ENCRYPTION_KEY: AI_KEY,
    });
    expect(env.BFF_SHARED_SECRET).toBe('d'.repeat(40));
  });

  it.each(['development', 'test', undefined])(
    'may be absent when NODE_ENV is %s',
    (NODE_ENV) => {
      expect(
        validateEnv({ ...base, NODE_ENV }).BFF_SHARED_SECRET,
      ).toBeUndefined();
    },
  );

  it('rejects a short secret', () => {
    expect(() =>
      validateEnv({ ...base, BFF_SHARED_SECRET: 'too-short' }),
    ).toThrow(/BFF_SHARED_SECRET/);
  });

  it('rejects a placeholder secret', () => {
    expect(() =>
      validateEnv({
        ...base,
        BFF_SHARED_SECRET: `replace-me-${'x'.repeat(30)}`,
      }),
    ).toThrow(/BFF_SHARED_SECRET/);
  });
});

describe('validateEnv AI_KEY_ENCRYPTION_KEY', () => {
  const production = {
    ...base,
    NODE_ENV: 'production',
    BFF_SHARED_SECRET: 'd'.repeat(40),
  };

  it('is required in production', () => {
    expect(() => validateEnv(production)).toThrow(
      /AI_KEY_ENCRYPTION_KEY is required in production/,
    );
  });

  it('may be absent in development, where storing a key is simply unavailable', () => {
    expect(validateEnv(base).AI_KEY_ENCRYPTION_KEY).toBeUndefined();
  });

  it('must be 32 bytes, base64 encoded', () => {
    for (const bad of ['short', Buffer.alloc(16).toString('base64')]) {
      expect(() =>
        validateEnv({ ...production, AI_KEY_ENCRYPTION_KEY: bad }),
      ).toThrow(/AI_KEY_ENCRYPTION_KEY must be 32 bytes/);
    }
    expect(
      validateEnv({ ...production, AI_KEY_ENCRYPTION_KEY: AI_KEY })
        .AI_KEY_ENCRYPTION_KEY,
    ).toBe(AI_KEY);
  });
});
