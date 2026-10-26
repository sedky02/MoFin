import { validateEnv } from './env.validation';

// Regression tests for SEC-02: placeholder or weak signing secrets must stop
// the app from booting.
const SECRET_KEYS = [
  'JWT_ACCESS_SECRET',
  'JWT_MCP_SECRET',
  'REFRESH_TOKEN_SECRET',
] as const;

const strong = (seed: string) => `${seed}-4fA9xQ2LmZ8vTn7KdW3pYb6RcJ1hUe5G`;

function baseEnv(): Record<string, unknown> {
  return {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/mofin',
    JWT_ACCESS_SECRET: strong('access'),
    JWT_MCP_SECRET: strong('mcp'),
    REFRESH_TOKEN_SECRET: strong('refresh'),
  };
}

describe('validateEnv signing secrets', () => {
  it('accepts the baseline env with strong secrets', () => {
    expect(() => validateEnv(baseEnv())).not.toThrow();
  });

  describe.each(SECRET_KEYS)('%s', (key) => {
    const withValue = (value: unknown) => ({ ...baseEnv(), [key]: value });

    it('is required', () => {
      const env = baseEnv();
      delete env[key];
      expect(() => validateEnv(env)).toThrow(key);
    });

    it.each([
      ['empty', ''],
      ['short', 'short-value'],
      ['31 characters', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P'],
    ])('rejects a %s value', (_label, value) => {
      expect(() => validateEnv(withValue(value))).toThrow(key);
    });

    it.each([
      ['replace-me prefix', 'replace-me-with-a-long-random-string-0123456789'],
      ['replace_me', 'REPLACE_ME_with_a_long_random_string_0123456789'],
      ['change-me', 'change-me-to-something-long-and-random-0123456789'],
      ['changeme', 'changeme0123456789abcdefghijklmnopqrstuvwxyz'],
      ['secret', 'Zq8Lm2Vx9Tn4Kd7Wp3Yb6Rc1Hu5Ge0Jsecretf'],
      ['SECRET (any case)', 'Zq8Lm2Vx9Tn4Kd7Wp3Yb6Rc1Hu5Ge0JSECRETf'],
      ['example', 'Zq8Lm2Vx9Tn4Kd7Wp3Yb6Rc1Hu5Ge0Jexample'],
    ])('rejects a long placeholder (%s)', (_label, value) => {
      expect(value.length).toBeGreaterThanOrEqual(32);
      expect(() => validateEnv(withValue(value))).toThrow(key);
    });

    it('accepts a strong random value of 32+ characters', () => {
      const value = 'Zq8Lm2Vx9Tn4Kd7Wp3Yb6Rc1Hu5Ge0Jf';
      expect(value.length).toBeGreaterThanOrEqual(32);
      expect(validateEnv(withValue(value))[key]).toBe(value);
    });
  });
});
