import { z } from 'zod';

/**
 * Fail fast at startup if required configuration is missing or malformed,
 * rather than discovering it on the first request that needs a secret.
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
    // Separate signing key for MCP/OAuth access tokens so an MCP-scoped token is
    // never even a candidate signature for the first-party web verifier (SEC-XX).
    JWT_MCP_SECRET: secretSchema,
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),
    // Derives each rotated refresh token from the one it replaces, so a retry
    // right after a rotation can get the same successor back. Changing it only
    // affects tokens rotated in the 30 s before the change.
    REFRESH_TOKEN_SECRET: secretSchema,
    PORT: z.coerce.number().int().positive().default(3000),

    // --- OAuth 2.1 authorization server (MCP custom connector) ---
    // Public base URL of THIS backend. Must exactly match the `iss` claim and the
    // origin claude.ai discovers. In dev this is localhost; in production set it to
    // the public HTTPS tunnel/host. Issuer is derived from config, never the Host
    // header, to prevent host-header spoofing of the issuer.
    OAUTH_ISSUER: z.string().url().default('http://localhost:3000'),
    // Canonical MCP resource URL used as the access token `aud`. Defaults to
    // `${OAUTH_ISSUER}/api/v1/mcp` if omitted (resolved in env.config below).
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

    // --- Observability (OBS-01) ---
    // Unset in dev: Sentry.init is skipped and errors just log, no client needed.
    SENTRY_DSN: z.string().url().optional(),

    NODE_ENV: z.string().optional(),

    // --- Outgoing email (password reset) ---
    // With SMTP_HOST unset, mail goes to a log-only sender instead (see MailModule).
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    // "true" for implicit TLS (usually port 465); otherwise STARTTLS is used when offered.
    SMTP_SECURE: z.enum(['true', 'false']).default('false'),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().min(1).default('MoFin <no-reply@mofin.local>'),
    // Development/test only: write every outgoing email as a JSON file in this
    // directory so local end-to-end tests can read the reset link.
    MAIL_CAPTURE_DIR: z.string().min(1).optional(),
    PASSWORD_RESET_TTL: z
      .string()
      .regex(/^\d+(s|m|h|d)$/, 'Use a duration such as 30m')
      .default('30m'),
  })
  .superRefine((env, ctx) => {
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
