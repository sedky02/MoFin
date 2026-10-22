// Post-login return path. Comes from the URL, so it must be a same-origin
// app path — anything else (absolute URL, "//host", "/\host", auth pages) would
// be an open redirect or a loop, and falls back to the dashboard.
export const DEFAULT_AFTER_LOGIN = "/dashboard";

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return DEFAULT_AFTER_LOGIN;
  }
  if (/^\/(login|register|forgot-password|reset-password|api)(\/|\?|#|$)/.test(raw)) return DEFAULT_AFTER_LOGIN;
  return raw;
}

/**
 * `/login` URL that returns the user to `path` afterwards (no `next` for the
 * default), optionally with the reason the login page should explain.
 */
export function loginUrlWithNext(path: string, reason?: "expired"): string {
  const qs = new URLSearchParams();
  const next = safeNextPath(path);
  if (next !== DEFAULT_AFTER_LOGIN) qs.set("next", next);
  if (reason) qs.set("reason", reason);
  const query = qs.toString();
  return query ? `/login?${query}` : "/login";
}
