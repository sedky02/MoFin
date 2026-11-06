import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  BACKEND_TIMEOUT_MS,
  BACKEND_URL,
  refreshTokens,
  setAuthCookies,
  clearAuthCookies,
  type BackendTokens,
} from "@/lib/auth-cookies";
import { bffHeaders } from "@/lib/bff-headers";

/**
 * Exchanges the user's httpOnly backend token for a one-time handoff secret, then redirects to the
 * backend's session/consume so its cookie is set on its own origin.
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

  // Falls back to login and clears cookies so the form renders instead of redirecting back here
  // (loop-breaker); `mcp_authorize` is kept so the connect resumes.
  const bailToLogin = () => {
    const login = new URL("/login", req.url);
    login.searchParams.set("mcp_authorize", cont);
    const res = NextResponse.redirect(login);
    clearAuthCookies(res);
    return res;
  };

  if (!accessToken && !refreshToken) {
    return bailToLogin();
  }

  let refreshed: BackendTokens | null = null;

  if (!accessToken && refreshToken) {
    refreshed = await refreshTokens(refreshToken, req);
    if (!refreshed) return bailToLogin();
    accessToken = refreshed.accessToken;
  }

  const requestHandoff = () =>
    fetch(`${BACKEND_URL}/oauth/session/handoff`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, ...bffHeaders(req) },
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });

  let upstream: Response;
  try {
    upstream = await requestHandoff();

    // Access token present but expired → one refresh + retry (mirrors the API proxy).
    if (upstream.status === 401 && refreshToken && !refreshed) {
      refreshed = await refreshTokens(refreshToken, req);
      if (!refreshed) return bailToLogin();
      accessToken = refreshed.accessToken;
      upstream = await requestHandoff();
    }
  } catch {
    // Backend unreachable: fail the connector flow visibly rather than hang.
    return bailToLogin();
  }

  if (!upstream.ok) {
    return bailToLogin();
  }

  const { handoff } = (await upstream.json()) as { handoff: string };

  const consume = new URL("/api/v1/oauth/session/consume", continueUrl.origin);
  consume.searchParams.set("handoff", handoff);
  consume.searchParams.set("continue", cont);
  const res = NextResponse.redirect(consume);
  if (refreshed) setAuthCookies(res, refreshed);
  return res;
}
