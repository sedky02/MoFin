import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BACKEND_URL, setAuthCookies, type BackendTokens } from "@/lib/auth-cookies";

const STATE_COOKIE = "google_oauth";

/**
 * Google redirects here with an authorization code. We validate the CSRF state,
 * hand the code to the backend (which holds the client secret and upserts the
 * user), set the resulting tokens as httpOnly cookies on the web origin, then
 * resume the MCP connector flow if one was in progress.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  const jar = await cookies();
  const raw = jar.get(STATE_COOKIE)?.value;
  let saved: { state: string; mcpAuthorize: string } | null = null;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }

  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${reason}`, req.url));
    res.cookies.set(STATE_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
    return res;
  };

  if (!code || !state || !saved || state !== saved.state || !redirectUri) {
    return fail("google_failed");
  }

  const upstream = await fetch(`${BACKEND_URL}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirectUri }),
    cache: "no-store",
  });
  if (!upstream.ok) {
    return fail("google_failed");
  }

  const tokens = (await upstream.json()) as BackendTokens;

  // Resume the MCP OAuth bridge if this sign-in was initiated by it.
  const target = saved.mcpAuthorize
    ? `/api/auth/mcp-handoff?continue=${encodeURIComponent(saved.mcpAuthorize)}`
    : "/dashboard";
  const res = NextResponse.redirect(new URL(target, req.url));
  setAuthCookies(res, tokens);
  res.cookies.set(STATE_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
  return res;
}
