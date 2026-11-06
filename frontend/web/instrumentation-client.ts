import * as Sentry from "@sentry/nextjs";

// An unset NEXT_PUBLIC_SENTRY_DSN (local dev) makes Sentry.init a no-op, so every capture call
// stays safe to make unconditionally.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});
