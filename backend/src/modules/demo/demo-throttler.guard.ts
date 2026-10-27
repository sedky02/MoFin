import { Injectable } from '@nestjs/common';
import { AuthThrottlerGuard } from '../../common/guards/auth-throttler.guard';

/** New demo users per client IP. */
export const DEMO_THROTTLE = { limit: 3, ttl: 60 * 60_000 } as const;

/**
 * DEMO_THROTTLE per client IP (the one the BFF vouched for, see
 * trusted-client-ip.middleware.ts). Each demo is a few hundred rows, so this
 * is what stops one client from filling the database or the active-demo cap.
 */
@Injectable()
export class DemoThrottlerGuard extends AuthThrottlerGuard {
  protected throttle(): { limit: number; ttl: number } {
    return DEMO_THROTTLE;
  }

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(`demo:${String(req.ip)}`);
  }
}
