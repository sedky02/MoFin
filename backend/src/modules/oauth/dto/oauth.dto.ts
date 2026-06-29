import { z } from 'zod';

/**
 * Dynamic Client Registration request (RFC 7591). claude.ai is a public PKCE
 * client, so we only really consume `redirect_uris`; the rest is echoed back.
 */
export const registerClientSchema = z.object({
  redirect_uris: z.array(z.string().url()).min(1),
  client_name: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
  scope: z.string().optional(),
});
export type RegisterClientDto = z.infer<typeof registerClientSchema>;

/** Query parameters for GET /oauth/authorize. */
export const authorizeQuerySchema = z.object({
  response_type: z.string(),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(1),
  code_challenge_method: z.string(),
  state: z.string().min(1),
  scope: z.string().optional(),
  resource: z.string().optional(),
});
export type AuthorizeQueryDto = z.infer<typeof authorizeQuerySchema>;

/** Body for POST /oauth/consent (the approve/deny form submission). */
export const consentBodySchema = authorizeQuerySchema.extend({
  decision: z.enum(['approve', 'deny']),
});
export type ConsentBodyDto = z.infer<typeof consentBodySchema>;

/**
 * Token endpoint body (application/x-www-form-urlencoded). Fields differ per
 * grant; validated loosely here and enforced per-grant in the service.
 */
export const tokenBodySchema = z.object({
  grant_type: z.string(),
  code: z.string().optional(),
  code_verifier: z.string().optional(),
  redirect_uri: z.string().optional(),
  client_id: z.string().optional(),
  refresh_token: z.string().optional(),
});
export type TokenBodyDto = z.infer<typeof tokenBodySchema>;
