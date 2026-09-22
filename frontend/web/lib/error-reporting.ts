import * as Sentry from "@sentry/nextjs";

/**
 * Single choke point for reporting a caught render-time error (from an
 * error.tsx/global-error.tsx boundary) upstream (audit OBS-01). Every
 * boundary calls through here so swapping the reporting backend is a
 * one-file change instead of hunting down every catch site.
 */
export function reportError(error: Error & { digest?: string }, context: { boundary: string }): void {
  console.error(`[${context.boundary}]`, error.digest ? `(digest: ${error.digest})` : "", error);
  Sentry.captureException(error, {
    tags: { boundary: context.boundary },
    extra: { digest: error.digest },
  });
}
