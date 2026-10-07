// Post-login return path. Comes from the URL, so it must be a same-origin
// app path — anything else (absolute URL, "//host", "/\host", auth pages) would
// be an open redirect or a loop, and falls back to the dashboard.
export const DEFAULT_AFTER_LOGIN = "/dashboard";

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return DEFAULT_AFTER_LOGIN;
  }
  if (/^\/(login|register|api)(\/|\?|$)/.test(raw)) return DEFAULT_AFTER_LOGIN;
  return raw;
}

/** `/login` URL that returns the user to `path` afterwards (plain `/login` for the default). */
export function loginUrlWithNext(path: string): string {
  const next = safeNextPath(path);
  return next === DEFAULT_AFTER_LOGIN ? "/login" : `/login?next=${encodeURIComponent(next)}`;
}
