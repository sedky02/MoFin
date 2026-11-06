import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import { sha256 } from '../utils/hash';

export const REFRESH_THROTTLE = { limit: 5, ttl: 60_000 } as const;

/**
 * Keyed by a hash of the refresh token (else the IP): per-IP made every tab and every user behind a
 * NAT share five refreshes a minute, and the BFF turned the 429 into a logout.
 */
export function refreshTokenTracker(req: Record<string, unknown>): string {
  const token = (req.body as { refreshToken?: unknown } | undefined)
    ?.refreshToken;
  if (typeof token === 'string' && token.length > 0)
    return `refresh:${sha256(token)}`;
  return `ip:${String(req.ip)}`;
}

/**
 * The route has no @Throttle, so the global per-IP baseline stays on top under a different tracker.
 */
@Injectable()
export class RefreshThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(refreshTokenTracker(req));
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
