import * as Sentry from "@sentry/nextjs";

// Unset SENTRY_DSN (local dev has no Sentry project) means Sentry.init is a
// no-op client — every capture call elsewhere in the app stays safe to call
// unconditionally (audit OBS-01).
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
  }
}

// Reports errors from Server Components/Route Handlers/Server Actions that
// Next.js's own error handling catches before they'd otherwise reach one of
// our error.tsx boundaries (which report via lib/error-reporting.ts instead).
export const onRequestError = Sentry.captureRequestError;
