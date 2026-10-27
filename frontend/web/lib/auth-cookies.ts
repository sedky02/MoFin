// Server-only auth cookie helpers (imported only by route handlers / Server Components).
// Tokens live in httpOnly cookies; the browser never sees them. Secure flag follows
// NODE_ENV (false in dev, true in prod).
import { NextResponse } from "next/server";
import { bffHeaders } from "@/lib/bff-headers";
import { SIGNED_IN_COOKIE } from "@/lib/session-hint";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
/**
 * Set and cleared with the session: a non-secret hint, readable by client code
 * (the session cookies are httpOnly). The prerendered landing page uses it to
 * offer "Open MoFin" instead of "Sign in". It grants nothing: if it is stale,
 * the dashboard's own auth still sends the visitor to sign in.
 */
export { SIGNED_IN_COOKIE };

// ~15 min access, ~30 day refresh.
export const ACCESS_MAX_AGE = 60 * 15;
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

export const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3000/api/v1";

// Server-to-server calls to the backend must never hang indefinitely — a hung
// backend would otherwise cascade into every request handler waiting forever
// (audit PERF-XX). Generous enough for a cold-starting backend after a long idle.
export const BACKEND_TIMEOUT_MS = 8_000;

function baseCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/**
 * Whether auth cookies carry the Secure flag: on in production, off in dev.
 * COOKIE_SECURE="false" turns it off for a production build served over plain
 * http (the docker compose demo on http://localhost, where some browsers drop
 * Secure cookies); COOKIE_SECURE="true" forces it on.
 */
export function secureCookies(): boolean {
  const override = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV === "production";
}

/** Set both auth cookies on a NextResponse so they reach the browser. */
export function setAuthCookies(
  res: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, baseCookieOptions(ACCESS_MAX_AGE));
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, baseCookieOptions(REFRESH_MAX_AGE));
  res.cookies.set(SIGNED_IN_COOKIE, "1", { ...baseCookieOptions(REFRESH_MAX_AGE), httpOnly: false });
}

/** Clear both auth cookies (logout / failed refresh). */
export function clearAuthCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_COOKIE, "", { ...baseCookieOptions(0), maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { ...baseCookieOptions(0), maxAge: 0 });
  res.cookies.set(SIGNED_IN_COOKIE, "", { ...baseCookieOptions(0), httpOnly: false, maxAge: 0 });
}

export interface BackendTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Outcome of presenting a refresh token to the backend:
 * - "ok": rotated; set the new pair.
 * - "rejected": the backend refused the token (invalid, expired, reused), so
 *   the session is over and the caller clears the cookies.
 * - "unavailable": rate limited (429), a 5xx, a timeout or a network error.
 *   That says nothing about the token, so the session must be kept and the
 *   client told to retry. `retryAfter` relays the backend's Retry-After.
 */
export type RefreshOutcome =
  | { kind: "ok"; tokens: BackendTokens }
  | { kind: "rejected" }
  | { kind: "unavailable"; retryAfter?: string };

/** Exchange a refresh token for a fresh token pair. Never throws. */
export async function requestRefresh(
  refreshToken: string,
  req?: Request,
): Promise<RefreshOutcome> {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...bffHeaders(req) },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
    if (res.status === 429 || res.status >= 500) {
      return { kind: "unavailable", retryAfter: res.headers.get("retry-after") ?? undefined };
    }
    if (!res.ok) return { kind: "rejected" };
    return { kind: "ok", tokens: (await res.json()) as BackendTokens };
  } catch {
    // Timed out / unreachable (e.g. a cold-starting backend).
    return { kind: "unavailable" };
  }
}

/**
 * requestRefresh collapsed to the token pair, or null, for callers that
 * don't tell a rejected token apart from an unavailable backend.
 */
export async function refreshTokens(
  refreshToken: string,
  req?: Request,
): Promise<BackendTokens | null> {
  const outcome = await requestRefresh(refreshToken, req);
  return outcome.kind === "ok" ? outcome.tokens : null;
}

/**
 * 503 for a refresh that couldn't be completed right now. Leaves the auth
 * cookies alone so the client can retry instead of being logged out.
 */
export function refreshUnavailableResponse(retryAfter?: string): NextResponse {
  const res = NextResponse.json(
    { statusCode: 503, message: "Couldn't refresh your session right now. Please try again." },
    { status: 503 },
  );
  if (retryAfter) res.headers.set("retry-after", retryAfter);
  return res;
}
