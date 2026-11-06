import * as Sentry from "@sentry/nextjs";

/**
 * Single choke point for reporting a caught render error upstream (audit OBS-01), so swapping the
 * reporting backend is a one-file change.
 */
export function reportError(error: Error & { digest?: string }, context: { boundary: string }): void {
  console.error(`[${context.boundary}]`, error.digest ? `(digest: ${error.digest})` : "", error);
  Sentry.captureException(error, {
    tags: { boundary: context.boundary },
    extra: { digest: error.digest },
  });
}
