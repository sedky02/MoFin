import * as Sentry from '@sentry/node';

/**
 * No-op when SENTRY_DSN is unset (local dev has no Sentry project) — every
 * call site is safe to hit unconditionally rather than threading an
 * `if (dsn)` check through the codebase.
 */
export function initSentry(dsn: string | undefined): void {
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0 });
}

export { Sentry };
