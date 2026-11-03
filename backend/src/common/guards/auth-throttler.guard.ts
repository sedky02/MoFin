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
export const FORGOT_PASSWORD_IP_THROTTLE = {
  limit: 20,
  ttl: 15 * 60_000,
} as const;

/**
 * Throttle key for the credential routes:
 * - the submitted email plus IP, when the body has an email (login, register,
 *   forgot password);
 * - a hash of the presented reset token, when the body has one (reset
 *   password), so the bucket follows the token rather than whoever shares
 *   the IP. The raw token is never part of the key;
 * - the IP alone otherwise.
 *
 * `req.ip` is the client IP the BFF vouched for when it sent one (see
 * trusted-client-ip.middleware.ts), so every tracker here keys on the real
 * client rather than the BFF.
 */
export function authTracker(req: Record<string, unknown>): string {
  const body = req.body as { email?: unknown; token?: unknown } | undefined;
  if (typeof body?.email === 'string')
    return `${String(req.ip)}:${body.email.trim().toLowerCase()}`;
  if (typeof body?.token === 'string' && body.token.length > 0)
    return `reset:${sha256(body.token)}`;
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

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(authTracker(req));
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { limit, ttl } = this.throttle();
    return super.handleRequest({
      ...requestProps,
      limit,
      ttl,
      blockDuration: ttl,
    });
  }
}

/** AuthThrottlerGuard with FORGOT_PASSWORD_THROTTLE instead. */
@Injectable()
export class ForgotPasswordThrottlerGuard extends AuthThrottlerGuard {
  protected throttle(): { limit: number; ttl: number } {
    return FORGOT_PASSWORD_THROTTLE;
  }
}

/** Per-user limit on POST /auth/password/change. */
export const CHANGE_PASSWORD_THROTTLE = { limit: 5, ttl: 60_000 } as const;

/**
 * Throttle key for password change: the signed-in user's id, so a stolen
 * session can't use the route to guess the current password faster than the
 * login route allows, whatever IPs it comes from. The global JWT guard runs
 * first, so `req.user` is set by the time this guard reads it.
 */
export function userTracker(req: Record<string, unknown>): string {
  const id = (req.user as { id?: unknown } | undefined)?.id;
  if (typeof id === 'string' && id.length > 0) return `user:${id}`;
  return `ip:${String(req.ip)}`;
}

/** CHANGE_PASSWORD_THROTTLE per userTracker key. */
@Injectable()
export class ChangePasswordThrottlerGuard extends AuthThrottlerGuard {
  protected throttle(): { limit: number; ttl: number } {
    return CHANGE_PASSWORD_THROTTLE;
  }

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(userTracker(req));
  }
}

/**
 * Per-IP limit on POST /auth/google/id-token (native Google sign-in from the
 * mobile app).
 *
 * Why 30 a minute: phones on mobile data sit behind carrier-grade NAT, where
 * one public IPv4 is shared by hundreds or thousands of subscribers. At the
 * old AUTH_THROTTLE (5/min) the sixth person on that IP to tap "Continue with
 * Google" within a minute locked everyone on it out for 60 s. A user signs in
 * here once per install or sign-out (refresh tokens keep them signed in
 * after that), so 30/min (one every 2 s, sustained) leaves room for a busy
 * carrier IP while still capping what one client can push through.
 *
 * This limit is not what stops forged tokens: GoogleIdTokenVerifier's RS256
 * signature check against Google's keys does that, and no number of tries
 * gets past it. The cap only bounds the CPU (signature checks) and database
 * work (user lookup, refresh token write) one IP can cause, alongside the
 * global 300/min per-IP baseline.
 */
export const GOOGLE_ID_TOKEN_THROTTLE = { limit: 30, ttl: 60_000 } as const;

/**
 * Throttle key for POST /auth/google/id-token: the client IP only. It never
 * reads the body, which this guard sees before validation, so no field a
 * client adds (an `email`, say) can move it into a fresh bucket.
 */
export function googleIdTokenTracker(req: Record<string, unknown>): string {
  return `google-id-token:${String(req.ip)}`;
}

/** GOOGLE_ID_TOKEN_THROTTLE per googleIdTokenTracker key. */
@Injectable()
export class GoogleIdTokenThrottlerGuard extends AuthThrottlerGuard {
  protected throttle(): { limit: number; ttl: number } {
    return GOOGLE_ID_TOKEN_THROTTLE;
  }

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(googleIdTokenTracker(req));
  }
}

/** Per-user limit on the destructive routes: DELETE /users/me and POST /users/me/reset-data. */
export const DELETE_ACCOUNT_THROTTLE = { limit: 5, ttl: 60_000 } as const;

/**
 * DELETE_ACCOUNT_THROTTLE per userTracker key: a stolen session can't hammer
 * the destructive routes.
 */
@Injectable()
export class DeleteAccountThrottlerGuard extends ChangePasswordThrottlerGuard {
  protected throttle(): { limit: number; ttl: number } {
    return DELETE_ACCOUNT_THROTTLE;
  }
}
