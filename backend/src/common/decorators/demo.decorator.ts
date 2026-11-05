import { ForbiddenException, SetMetadata } from '@nestjs/common';

export const DEMO_BLOCKED_KEY = 'demoBlocked';
export const DEMO_QUOTA_KEY = 'demoQuota';

/** Usage a demo user is capped on (see DemoRestrictionsGuard). */
export type DemoQuotaName = 'ai-drafts' | 'ai-chat';

/**
 * Closes a route to temporary demo users: anything that would lock other
 * visitors out of a demo, reach outside MoFin, or that a throwaway account has
 * no use for (password, sessions, account deletion, connecting AI apps).
 * Enforced by DemoRestrictionsGuard.
 */
export const DemoBlocked = () => SetMetadata(DEMO_BLOCKED_KEY, true);

/** Caps a demo user's use of a route at the named quota. */
export const DemoQuota = (quota: DemoQuotaName) =>
  SetMetadata(DEMO_QUOTA_KEY, quota);

/** What a demo user gets from a blocked route. */
export function demoBlocked(): ForbiddenException {
  return new ForbiddenException({
    code: 'DEMO_BLOCKED',
    message: 'Not available in the demo. Create an account to use this.',
  });
}
