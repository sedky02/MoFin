import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import { sha256 } from '../utils/hash';

/** Per-client limit on login, register and password reset. */
export const AUTH_THROTTLE = { limit: 5, ttl: 60_000 } as const;

/** Per-client limit on POST /auth/password/forgot (longer window: it sends email). */
export const FORGOT_PASSWORD_THROTTLE = { limit: 5, ttl: 15 * 60_000 } as const;

/**
 * Per-IP cap on forgot-password: the per-email limit alone would let one IP mail any number of
 * addresses.
 */
export const FORGOT_PASSWORD_IP_THROTTLE = {
  limit: 20,
  ttl: 15 * 60_000,
} as const;

/**
 * Key for credential routes: email + IP, else a hash of the reset token, else the IP.
 * req.ip is the client IP the BFF vouched for.
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
 * Keyed by IP + email: every user arrives via one BFF hop, so IP alone can't stop credential
 * stuffing. No @Throttle on routes, so the global limit is a backstop.
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

@Injectable()
export class ForgotPasswordThrottlerGuard extends AuthThrottlerGuard {
  protected throttle(): { limit: number; ttl: number } {
    return FORGOT_PASSWORD_THROTTLE;
  }
}

export const CHANGE_PASSWORD_THROTTLE = { limit: 5, ttl: 60_000 } as const;

/**
 * Keyed by user id, so a stolen session can't guess the current password faster than the login
 * route allows.
 */
export function userTracker(req: Record<string, unknown>): string {
  const id = (req.user as { id?: unknown } | undefined)?.id;
  if (typeof id === 'string' && id.length > 0) return `user:${id}`;
  return `ip:${String(req.ip)}`;
}

@Injectable()
export class ChangePasswordThrottlerGuard extends AuthThrottlerGuard {
  protected throttle(): { limit: number; ttl: number } {
    return CHANGE_PASSWORD_THROTTLE;
  }

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(userTracker(req));
  }
}

/** Per-user limit on POST /auth/email/verification: it sends mail. */
export const EMAIL_VERIFICATION_THROTTLE = {
  limit: 5,
  ttl: 15 * 60_000,
} as const;

@Injectable()
export class EmailVerificationThrottlerGuard extends ChangePasswordThrottlerGuard {
  protected throttle(): { limit: number; ttl: number } {
    return EMAIL_VERIFICATION_THROTTLE;
  }
}

/** Per-user limit on creating invitations: each one mails an address the sender picks. */
export const INVITATION_THROTTLE = { limit: 10, ttl: 60 * 60_000 } as const;

@Injectable()
export class InvitationThrottlerGuard extends ChangePasswordThrottlerGuard {
  protected throttle(): { limit: number; ttl: number } {
    return INVITATION_THROTTLE;
  }
}

/** Limit per presented invitation token on its preview, accept and decline routes. */
export const INVITATION_TOKEN_THROTTLE = { limit: 20, ttl: 60_000 } as const;

@Injectable()
export class InvitationTokenThrottlerGuard extends AuthThrottlerGuard {
  protected throttle(): { limit: number; ttl: number } {
    return INVITATION_TOKEN_THROTTLE;
  }
}

/**
 * Per-IP only: phones on carrier NAT share an IP, so 5/min locked out whole carriers. Forged tokens
 * are stopped by the signature check, not this limit; it only bounds CPU and database work per IP.
 */
export const GOOGLE_ID_TOKEN_THROTTLE = { limit: 30, ttl: 60_000 } as const;

/**
 * IP only, and never reads the body (seen before validation), so no client-added field can open a
 * fresh bucket.
 */
export function googleIdTokenTracker(req: Record<string, unknown>): string {
  return `google-id-token:${String(req.ip)}`;
}

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

@Injectable()
export class DeleteAccountThrottlerGuard extends ChangePasswordThrottlerGuard {
  protected throttle(): { limit: number; ttl: number } {
    return DELETE_ACCOUNT_THROTTLE;
  }
}

/** Per-user limit on saving or removing a stored AI key; each save also calls the provider. */
export const AI_CREDENTIAL_THROTTLE = { limit: 20, ttl: 60 * 60_000 } as const;

@Injectable()
export class AiCredentialThrottlerGuard extends ChangePasswordThrottlerGuard {
  protected throttle(): { limit: number; ttl: number } {
    return AI_CREDENTIAL_THROTTLE;
  }
}
