import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

const STATE_COOKIE = "google_oauth";

/**
 * Begin Google sign-in. We are the OAuth client to Google; the registered
 * redirect URI points back at our own callback route. A short-lived state cookie
 * carries CSRF state plus any in-flight MCP authorize URL so the callback can
 * resume the connector flow after sign-in. All Google endpoints/scopes/redirect
 * come from env — nothing is hardcoded.
 */
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const authUrlBase = process.env.GOOGLE_AUTH_URL;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const scopes = process.env.GOOGLE_SCOPES;
  if (!clientId || !authUrlBase || !redirectUri || !scopes) {
    return NextResponse.redirect(new URL("/login?error=google_unconfigured", req.url));
  }

  const state = randomBytes(16).toString("hex");
  const mcpAuthorize = new URL(req.url).searchParams.get("mcp_authorize") ?? "";

  const authUrl = new URL(authUrlBase);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, mcpAuthorize }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}
