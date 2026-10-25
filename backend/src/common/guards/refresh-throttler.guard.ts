import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import { sha256 } from '../utils/hash';

/** Per-token limit on POST /auth/refresh. */
export const REFRESH_THROTTLE = { limit: 5, ttl: 60_000 } as const;

/**
 * Throttle key for /auth/refresh: a hash of the presented refresh token, or
 * the client IP when the body has none. Keying on IP alone made every tab,
 * and every user behind one NAT, share five refreshes a minute, and the BFF
 * turned the resulting 429 into a logout. A legitimate token is presented
 * once (the BFF dedupes concurrent refreshes), so a per-token bucket only
 * fills when the same token is replayed. The raw token is never part of the
 * key, and the throttler hashes the key again before storing it.
 */
export function refreshTokenTracker(req: Record<string, unknown>): string {
  const token = (req.body as { refreshToken?: unknown } | undefined)
    ?.refreshToken;
  if (typeof token === 'string' && token.length > 0)
    return `refresh:${sha256(token)}`;
  return `ip:${String(req.ip)}`;
}

/**
 * Applies REFRESH_THROTTLE per refresh token. The route carries no @Throttle
 * of its own, so the global ThrottlerGuard still applies the app-wide per-IP
 * baseline on top as a backstop; the two use different trackers, so a
 * request isn't counted twice against one bucket.
 */
@Injectable()
export class RefreshThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return refreshTokenTracker(req);
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    return super.handleRequest({
      ...requestProps,
      limit: REFRESH_THROTTLE.limit,
      ttl: REFRESH_THROTTLE.ttl,
      blockDuration: REFRESH_THROTTLE.ttl,
    });
  }
}
