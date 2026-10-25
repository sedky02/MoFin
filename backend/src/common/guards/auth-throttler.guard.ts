import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import { sha256 } from '../utils/hash';

/** Per-client limit on login, register and password reset. */
export const AUTH_THROTTLE = { limit: 5, ttl: 60_000 } as const;

/** Per-client limit on POST /auth/password/forgot (longer window: it sends email). */
export const FORGOT_PASSWORD_THROTTLE = { limit: 5, ttl: 15 * 60_000 } as const;

/**
 * Per-IP cap on POST /auth/password/forgot, applied by the global guard from
 * the route's @Throttle. The per-email limit alone would let one IP send
 * reset emails to any number of addresses.
 */
export const FORGOT_PASSWORD_IP_THROTTLE = { limit: 20, ttl: 15 * 60_000 } as const;

/**
 * Throttle key for the credential routes:
 * - the submitted email plus IP, when the body has an email (login, register,
 *   forgot password);
 * - a hash of the presented reset token, when the body has one (reset
 *   password), so the bucket follows the token rather than whoever shares
 *   the IP. The raw token is never part of the key;
 * - the IP alone otherwise.
 */
export function authTracker(req: Record<string, unknown>): string {
  const body = req.body as { email?: unknown; token?: unknown } | undefined;
  if (typeof body?.email === 'string') return `${String(req.ip)}:${body.email.trim().toLowerCase()}`;
  if (typeof body?.token === 'string' && body.token.length > 0) return `reset:${sha256(body.token)}`;
  return `ip:${String(req.ip)}`;
}

/**
 * Applies AUTH_THROTTLE per authTracker key. IP alone is what the default
 * tracker uses, but every request from every user in this app arrives via
 * the same BFF hop — keying by IP+email is what actually stops credential
 * stuffing (many passwords against one email) and distributed attempts
 * against many emails from behind the same NAT/proxy from drowning each
 * other out (SEC-XX). The routes carry no @Throttle of their own, so the
 * global ThrottlerGuard only applies its app-wide per-IP baseline on top as
 * a backstop instead of also enforcing this tight limit per IP.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected throttle(): { limit: number; ttl: number } {
    return AUTH_THROTTLE;
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return authTracker(req);
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { limit, ttl } = this.throttle();
    return super.handleRequest({ ...requestProps, limit, ttl, blockDuration: ttl });
  }
}

/** AuthThrottlerGuard with FORGOT_PASSWORD_THROTTLE instead. */
@Injectable()
export class ForgotPasswordThrottlerGuard extends AuthThrottlerGuard {
  protected throttle(): { limit: number; ttl: number } {
    return FORGOT_PASSWORD_THROTTLE;
  }
}
