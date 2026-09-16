/**
 * Single choke point for reporting a caught render-time error (from an
 * error.tsx/global-error.tsx boundary) upstream. Today this only logs — there
 * is no error-reporting service wired up yet (see OBS-01) — but every
 * boundary calls through here so adding one later (Sentry, etc.) is a
 * one-file change instead of hunting down every catch site.
 */
export function reportError(error: Error & { digest?: string }, context: { boundary: string }): void {
  console.error(`[${context.boundary}]`, error.digest ? `(digest: ${error.digest})` : "", error);
}
