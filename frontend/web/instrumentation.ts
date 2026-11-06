import * as Sentry from "@sentry/nextjs";

// An unset SENTRY_DSN (local dev) makes Sentry.init a no-op, so every capture call stays safe to
// make unconditionally.
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
  }
}

// Reports errors from Server Components, Route Handlers and Server Actions that Next.js catches
// before an error.tsx boundary (which reports via lib/error-reporting.ts).
export const onRequestError = Sentry.captureRequestError;
