import * as Sentry from "@sentry/nextjs";

// Unset NEXT_PUBLIC_SENTRY_DSN (local dev has no Sentry project) means
// Sentry.init is a no-op client — every capture call elsewhere stays safe to
// call unconditionally (audit OBS-01).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});
