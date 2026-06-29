import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, BACKEND_URL } from "@/lib/auth-cookies";

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

  const accessToken = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    // Not authenticated → send back to login carrying the authorize target.
    const login = new URL("/login", req.url);
    login.searchParams.set("mcp_authorize", cont);
    return NextResponse.redirect(login);
  }

  const upstream = await fetch(`${BACKEND_URL}/oauth/session/handoff`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!upstream.ok) {
    const login = new URL("/login", req.url);
    login.searchParams.set("mcp_authorize", cont);
    return NextResponse.redirect(login);
  }

  const { handoff } = (await upstream.json()) as { handoff: string };

  const consume = new URL("/api/v1/oauth/session/consume", continueUrl.origin);
  consume.searchParams.set("handoff", handoff);
  consume.searchParams.set("continue", cont);
  return NextResponse.redirect(consume);
}
