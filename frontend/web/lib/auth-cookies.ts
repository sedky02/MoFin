// Server-only cookie helpers: tokens live in httpOnly cookies the browser never sees; Secure
// follows NODE_ENV.
import { NextResponse } from "next/server";
import { bffHeaders } from "@/lib/bff-headers";
import { SIGNED_IN_COOKIE } from "@/lib/session-hint";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
/**
 * A non-secret hint cookie set and cleared with the session, readable by client code; the
 * prerendered landing page uses it to offer "Open MoFin" instead of "Sign in". It grants nothing.
 */
export { SIGNED_IN_COOKIE };

export const ACCESS_MAX_AGE = 60 * 15;
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

export const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3000/api/v1";

// Server-to-server calls must not hang: a hung backend would otherwise stall every request handler
// (audit PERF-XX). Generous enough for a cold-starting backend.
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
 * COOKIE_SECURE="false" turns Secure off for a production build served over plain http (the docker
 * compose demo on localhost).
 */
export function secureCookies(): boolean {
  const override = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function setAuthCookies(
  res: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, baseCookieOptions(ACCESS_MAX_AGE));
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, baseCookieOptions(REFRESH_MAX_AGE));
  res.cookies.set(SIGNED_IN_COOKIE, "1", { ...baseCookieOptions(REFRESH_MAX_AGE), httpOnly: false });
}

/**
 * Ties an emailed verification link to the browser that signed up: only a browser holding this
 * value gets a session when it redeems the link. Lives as long as the link.
 */
export const SIGNUP_BINDING_COOKIE = "signup_binding";
export const SIGNUP_BINDING_MAX_AGE = 60 * 60 * 24;

export function setSignupBindingCookie(res: NextResponse, value: string): void {
  res.cookies.set(SIGNUP_BINDING_COOKIE, value, baseCookieOptions(SIGNUP_BINDING_MAX_AGE));
}

export function clearSignupBindingCookie(res: NextResponse): void {
  res.cookies.set(SIGNUP_BINDING_COOKIE, "", { ...baseCookieOptions(0), maxAge: 0 });
}

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
 * Outcome of presenting a refresh token: "ok" (set the new pair), "rejected" (session over: clear
 * cookies) or "unavailable" (keep the session, retry later).
 */
export type RefreshOutcome =
  | { kind: "ok"; tokens: BackendTokens }
  | { kind: "rejected" }
  | { kind: "unavailable"; retryAfter?: string };

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
