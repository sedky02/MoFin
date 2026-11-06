import { ForbiddenException, SetMetadata } from '@nestjs/common';

export const DEMO_BLOCKED_KEY = 'demoBlocked';
export const DEMO_QUOTA_KEY = 'demoQuota';

export type DemoQuotaName = 'ai-drafts' | 'ai-chat';

/**
 * Closes a route to demo users: anything that would lock other visitors out, reach outside MoFin,
 * or that a throwaway account has no use for.
 */
export const DemoBlocked = () => SetMetadata(DEMO_BLOCKED_KEY, true);

export const DemoQuota = (quota: DemoQuotaName) =>
  SetMetadata(DEMO_QUOTA_KEY, quota);

export function demoBlocked(): ForbiddenException {
  return new ForbiddenException({
    code: 'DEMO_BLOCKED',
    message: 'Not available in the demo. Create an account to use this.',
  });
}
