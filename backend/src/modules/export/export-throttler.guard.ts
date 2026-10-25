import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

/** Per-user limit on GET /export: it reads every row the user has. */
export const EXPORT_THROTTLE = { limit: 10, ttl: 60 * 60_000 } as const;

/**
 * Throttle key for the export: the signed-in user's id. The global JWT guard
 * runs before route guards, so `req.user` is set by the time this reads it;
 * the IP fallback only matters if the route is ever left without one.
 */
export function exportTracker(req: Record<string, unknown>): string {
  const id = (req.user as { id?: unknown } | undefined)?.id;
  if (typeof id === 'string' && id.length > 0) return `export:${id}`;
  return `ip:${String(req.ip)}`;
}

/**
 * Applies EXPORT_THROTTLE per user. The global ThrottlerGuard's per-IP
 * baseline still applies on top, under a different tracker.
 */
@Injectable()
export class ExportThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return exportTracker(req);
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    return super.handleRequest({
      ...requestProps,
      limit: EXPORT_THROTTLE.limit,
      ttl: EXPORT_THROTTLE.ttl,
      blockDuration: EXPORT_THROTTLE.ttl,
    });
  }
}
