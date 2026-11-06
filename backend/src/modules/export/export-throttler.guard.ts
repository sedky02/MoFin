import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

/** Per-user limit on GET /export: it reads every row the user has. */
export const EXPORT_THROTTLE = { limit: 10, ttl: 60 * 60_000 } as const;

/**
 * Keyed by user id: the global JWT guard runs first so req.user is set; the IP fallback only
 * matters if a route lacks one.
 */
export function exportTracker(req: Record<string, unknown>): string {
  const id = (req.user as { id?: unknown } | undefined)?.id;
  if (typeof id === 'string' && id.length > 0) return `export:${id}`;
  return `ip:${String(req.ip)}`;
}

@Injectable()
export class ExportThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(exportTracker(req));
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    return super.handleRequest({
      ...requestProps,
      limit: EXPORT_THROTTLE.limit,
      ttl: EXPORT_THROTTLE.ttl,
      blockDuration: EXPORT_THROTTLE.ttl,
    });
  }
}
