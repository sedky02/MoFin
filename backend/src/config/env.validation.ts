import { z } from 'zod';

/**
 * Fail fast at startup if required configuration is missing or malformed,
 * rather than discovering it on the first request that needs a secret.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
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
  // Comma-separated host allowlist for DCR redirect_uris (exact host match).
  OAUTH_ALLOWED_REDIRECT_HOSTS: z.string().default('claude.ai,claude.com'),
  // Lifetimes (seconds) for the short-lived OAuth artifacts.
  OAUTH_AUTH_CODE_TTL: z.coerce.number().int().positive().default(60),
  OAUTH_HANDOFF_TTL: z.coerce.number().int().positive().default(30),
  OAUTH_SESSION_TTL: z.coerce.number().int().positive().default(600),
  OAUTH_REFRESH_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),

  // --- Google sign-in (optional; endpoints return 503 until configured) ---
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_TOKEN_URL: z.string().url().optional(),
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
