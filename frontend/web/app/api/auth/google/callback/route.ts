import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/safe-next";
import { loginErrorUrl, type LoginErrorCode } from "@/lib/auth-feedback";
import { BACKEND_TIMEOUT_MS, BACKEND_URL, setAuthCookies, type BackendTokens } from "@/lib/auth-cookies";
import { bffHeaders } from "@/lib/bff-headers";

const STATE_COOKIE = "google_oauth";

/**
 * Validates the CSRF state, hands the code to the backend (which holds the client secret), sets the
 * tokens as httpOnly cookies, then resumes the MCP connector flow if one was in progress.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  const jar = await cookies();
  const raw = jar.get(STATE_COOKIE)?.value;
  let saved: { state: string; mcpAuthorize: string; next?: string } | null = null;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }

  // Back to /login with a code it can explain (and the return path, so a retry
  // still lands where the user was going).
  const fail = (code: LoginErrorCode) => {
    const res = NextResponse.redirect(new URL(loginErrorUrl(code, saved?.next), req.url));
    res.cookies.set(STATE_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
    return res;
  };

  if (!code || !state || !saved || state !== saved.state || !redirectUri) {
    return fail("google_failed");
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...bffHeaders(req) },
      body: JSON.stringify({ code, redirectUri }),
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
  } catch {
    return fail("google_failed");
  }
  if (!upstream.ok) {
    return fail("google_failed");
  }

  const tokens = (await upstream.json()) as BackendTokens;

  const target = saved.mcpAuthorize
    ? `/api/auth/mcp-handoff?continue=${encodeURIComponent(saved.mcpAuthorize)}`
    : safeNextPath(saved.next);
  const res = NextResponse.redirect(new URL(target, req.url));
  setAuthCookies(res, tokens);
  res.cookies.set(STATE_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
  return res;
}
