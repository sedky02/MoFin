// Server-only auth cookie helpers (imported only by route handlers / Server Components).
// Tokens live in httpOnly cookies; the browser never sees them. Secure flag follows
// NODE_ENV (false in dev, true in prod).
import type { NextResponse } from "next/server";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

// ~15 min access, ~30 day refresh.
export const ACCESS_MAX_AGE = 60 * 15;
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

export const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3000/api/v1";

function baseCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** Set both auth cookies on a NextResponse so they reach the browser. */
export function setAuthCookies(
  res: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, baseCookieOptions(ACCESS_MAX_AGE));
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, baseCookieOptions(REFRESH_MAX_AGE));
}

/** Clear both auth cookies (logout / failed refresh). */
export function clearAuthCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_COOKIE, "", { ...baseCookieOptions(0), maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { ...baseCookieOptions(0), maxAge: 0 });
}

export interface BackendTokens {
  accessToken: string;
  refreshToken: string;
}
