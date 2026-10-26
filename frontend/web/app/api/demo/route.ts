import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BACKEND_URL, REFRESH_COOKIE, setAuthCookies, type BackendTokens } from "@/lib/auth-cookies";
import { bffHeaders } from "@/lib/bff-headers";
import { demoNoticeUrl, type DemoNotice } from "@/lib/demo";

// Seeding a demo writes a few hundred rows, so it gets longer than a login.
const DEMO_TIMEOUT_MS = 20_000;

/**
 * "Try the demo" (a plain form POST from the landing page, so it works without
 * JavaScript). The backend gives this visitor their own temporary demo user, or
 * carries on with the one they already have; we set the session cookies and go
 * to the dashboard. Anything that stops it goes back to the landing page with a
 * reason it can show (?demo=busy|limited|off|failed).
 */
export async function POST(req: Request) {
  const back = (notice: DemoNotice) => NextResponse.redirect(new URL(demoNoticeUrl(notice), req.url), 303);
  const toDashboard = () => NextResponse.redirect(new URL("/dashboard", req.url), 303);

  // Cross-site form posts arrive without our SameSite=lax cookies, so one could
  // swap a signed-in visitor's session for a demo. Only our own pages may post.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return back("failed");

  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/auth/demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...bffHeaders(req) },
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(DEMO_TIMEOUT_MS),
    });
  } catch {
    return back("failed");
  }

  // Already signed in to a real account: keep that session.
  if (upstream.status === 409) return toDashboard();
  if (upstream.status === 429) return back("limited");
  if (upstream.status === 503) {
    const body = (await upstream.json().catch(() => ({}))) as { code?: string };
    return back(body.code === "DEMO_DISABLED" ? "off" : "busy");
  }
  if (!upstream.ok) return back("failed");

  const tokens = (await upstream.json()) as BackendTokens;
  const res = toDashboard();
  setAuthCookies(res, tokens);
  return res;
}
