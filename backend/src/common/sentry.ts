import * as Sentry from '@sentry/node';

/** No-op without SENTRY_DSN, so call sites need no `if (dsn)` checks. */
export function initSentry(dsn: string | undefined): void {
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0 });
}

export { Sentry };
