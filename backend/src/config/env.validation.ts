import { z } from 'zod';

/**
 * Fail fast at startup if required configuration is missing, not on the first request that needs a
 * secret.
 */
const secretSchema = z
  .string()
  .min(32, 'Secret must be at least 32 characters')
  .refine(
    (value) => !/replace.?me|change.?me|secret|example/i.test(value),
    'Secret contains a placeholder/example value',
  );
const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    JWT_ACCESS_SECRET: secretSchema,
    // Separate key for MCP/OAuth tokens, so an MCP token is never a candidate signature for the web
    // verifier.
    JWT_MCP_SECRET: secretSchema,
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),
    // Derives each rotated refresh token from the one it replaces, so a retry right after a
    // rotation gets the same successor.
    REFRESH_TOKEN_SECRET: secretSchema,
    PORT: z.coerce.number().int().positive().default(3000),
    // Shared with the web BFF, which sends the client IP it saw so rate limits key on the real
    // client. Required in production.
    BFF_SHARED_SECRET: secretSchema.optional(),

    // OAuth 2.1 server (MCP connector). OAUTH_ISSUER is this backend's public URL and must match
    // `iss`; read from config, never the Host header, to prevent spoofing.
    OAUTH_ISSUER: z.string().url().default('http://localhost:3000'),
    // Used as the access token `aud`; defaults to `${OAUTH_ISSUER}/api/v1/mcp`.
    OAUTH_RESOURCE_URI: z.string().url().optional(),
    // Where end users log in (the Next.js web app). Used by the login bridge.
    WEB_URL: z.string().url().default('http://localhost:3001'),
    // Lifetimes (seconds) for the short-lived OAuth artifacts.
    OAUTH_AUTH_CODE_TTL: z.coerce.number().int().positive().default(60),
    OAUTH_HANDOFF_TTL: z.coerce.number().int().positive().default(30),
    OAUTH_SESSION_TTL: z.coerce.number().int().positive().default(600),
    OAUTH_REFRESH_TTL: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60 * 24 * 30),

    // --- Google sign-in (optional; endpoints return 503 until configured) ---
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_TOKEN_URL: z.string().url().optional(),
    // Client ids a Google ID token may be issued for (its `aud`), comma-separated. Unset: that
    // route answers 503.
    GOOGLE_MOBILE_CLIENT_IDS: z.string().optional(),

    // Unset in dev: Sentry is skipped and errors just log.
    SENTRY_DSN: z.string().url().optional(),

    NODE_ENV: z.string().optional(),

    // With SMTP_HOST unset, mail goes to a log-only sender (see MailModule).
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    // "true" for implicit TLS (usually port 465); otherwise STARTTLS is used when offered.
    SMTP_SECURE: z.enum(['true', 'false']).default('false'),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    // "true" sends pushes through the Expo push service; otherwise they are only counted in the log.
    EXPO_PUSH_ENABLED: z.enum(['true', 'false']).default('false'),
    // Only needed when "Enhanced Security for Push Notifications" is on for the Expo project.
    EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
    MAIL_FROM: z.string().min(1).default('MoFin <no-reply@mofin.local>'),
    // Development/test only: writes each email as a JSON file so local e2e tests can read the
    // links.
    MAIL_CAPTURE_DIR: z.string().min(1).optional(),
    PASSWORD_RESET_TTL: z
      .string()
      .regex(/^\d+(s|m|h|d)$/, 'Use a duration such as 30m')
      .default('30m'),

    // Unset: on outside production, off in production until "true".
    DEMO_ENABLED: z.enum(['true', 'false']).optional(),
    // How long a demo user lives before DemoCleanupCron deletes it.
    DEMO_TTL_HOURS: z.coerce.number().int().positive().max(168).default(24),
    // Live demo users at once; further visitors get "demo is busy".
    DEMO_MAX_ACTIVE: z.coerce.number().int().positive().default(200),
    // AI drafts one demo user can create.
    DEMO_AI_CAP: z.coerce.number().int().positive().default(30),

    // Any OpenAI-compatible chat endpoint works. With AI_API_KEY unset, drafts use the local regex
    // parser and chat answers 503.
    AI_API_KEY: z.string().min(1).optional(),
    AI_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
    AI_MODEL: z.string().min(1).default('openai/gpt-oss-120b'),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    // Chat questions one demo visitor can ask (counted in the database).
    DEMO_AI_CHAT_CAP: z.coerce.number().int().positive().default(15),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.BFF_SHARED_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BFF_SHARED_SECRET'],
        message: 'BFF_SHARED_SECRET is required in production',
      });
    }
    if (env.NODE_ENV === 'production' && env.MAIL_CAPTURE_DIR) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MAIL_CAPTURE_DIR'],
        message: 'MAIL_CAPTURE_DIR must not be set in production',
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
