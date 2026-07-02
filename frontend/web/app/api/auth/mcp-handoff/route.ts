import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  BACKEND_URL,
  refreshTokens,
  setAuthCookies,
  clearAuthCookies,
  type BackendTokens,
} from "@/lib/auth-cookies";

/**
 * Cross-origin login bridge (web → backend).
 *
 * After the user authenticates on the web origin, this route exchanges their
 * (httpOnly) backend access token for a one-time handoff secret from the backend
 * OAuth server, then redirects the browser to the backend's /session/consume,
 * which sets a first-party backend session cookie and resumes the OAuth
 * /authorize flow. The access token never leaves the server; only the short-lived
 * handoff secret rides in the redirect URL.
 *
 * `continue` is the original backend /authorize URL we must return to. Its origin
 * is the public backend origin, so we derive the consume URL from it (this works
 * both in local dev and behind a public tunnel).
 *
 * The access token is short-lived (~15 min) while the middleware only gates on
 * the long-lived refresh token, so this route must self-heal an expired/missing
 * access token by refreshing — otherwise the middleware keeps forcing us here
 * while we keep bouncing to /login (an infinite redirect loop).
 */
export async function GET(req: NextRequest) {
  const cont = req.nextUrl.searchParams.get("continue");
  if (!cont) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  let continueUrl: URL;
  try {
    continueUrl = new URL(cont);
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  // Only ever continue to the backend OAuth authorize endpoint.
  if (!continueUrl.pathname.endsWith("/oauth/authorize")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const jar = await cookies();
  let accessToken = jar.get(ACCESS_COOKIE)?.value;
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;

  // Fall back to login, clearing cookies so the middleware sees no session and
  // renders the form instead of force-redirecting back here (loop-breaker).
  // `mcp_authorize` is preserved so the connect resumes after re-login.
  const bailToLogin = () => {
    const login = new URL("/login", req.url);
    login.searchParams.set("mcp_authorize", cont);
    const res = NextResponse.redirect(login);
    clearAuthCookies(res);
    return res;
  };

  // No session at all → send to login.
  if (!accessToken && !refreshToken) {
    return bailToLogin();
  }

  let refreshed: BackendTokens | null = null;

  // Access token gone but refresh alive → refresh before the handoff.
  if (!accessToken && refreshToken) {
    refreshed = await refreshTokens(refreshToken);
    if (!refreshed) return bailToLogin();
    accessToken = refreshed.accessToken;
  }

  const requestHandoff = () =>
    fetch(`${BACKEND_URL}/oauth/session/handoff`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

  let upstream = await requestHandoff();

  // Access token present but expired → one refresh + retry (mirrors the API proxy).
  if (upstream.status === 401 && refreshToken && !refreshed) {
    refreshed = await refreshTokens(refreshToken);
    if (!refreshed) return bailToLogin();
    accessToken = refreshed.accessToken;
    upstream = await requestHandoff();
  }

  if (!upstream.ok) {
    return bailToLogin();
  }

  const { handoff } = (await upstream.json()) as { handoff: string };

  const consume = new URL("/api/v1/oauth/session/consume", continueUrl.origin);
  consume.searchParams.set("handoff", handoff);
  consume.searchParams.set("continue", cont);
  const res = NextResponse.redirect(consume);
  // Persist refreshed tokens so later requests use the new access token.
  if (refreshed) setAuthCookies(res, refreshed);
  return res;
}
