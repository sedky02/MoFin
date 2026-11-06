import { Injectable } from '@nestjs/common';
import { AuthThrottlerGuard } from '../../common/guards/auth-throttler.guard';

export const DEMO_THROTTLE = { limit: 3, ttl: 60 * 60_000 } as const;

/**
 * Each demo is a few hundred rows, so this limit stops one client filling the database or the
 * active-demo cap.
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
