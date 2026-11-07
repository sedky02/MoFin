import * as Sentry from '@sentry/node';

const SECRET_HEADERS = ['authorization', 'cookie', 'x-mofin-bff-secret'];

/**
 * Error reports carry no request body (it may hold a password or an AI provider key) and no
 * credentials in headers.
 */
export function scrubSentryEvent<T extends Sentry.Event>(event: T): T {
  if (!event.request) return event;
  delete event.request.data;
  delete event.request.cookies;
  if (event.request.headers) {
    for (const name of Object.keys(event.request.headers)) {
      if (SECRET_HEADERS.includes(name.toLowerCase())) {
        delete event.request.headers[name];
      }
    }
  }
  return event;
}

/** No-op without SENTRY_DSN, so call sites need no `if (dsn)` checks. */
export function initSentry(dsn: string | undefined): void {
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0, beforeSend: scrubSentryEvent });
}

export { Sentry };
