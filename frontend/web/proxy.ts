// Next.js 16: proxy.ts REPLACES middleware.ts. The exported function is `proxy`.
// NextRequest.cookies here is SYNCHRONOUS (not the async cookies() from next/headers).
import { NextRequest, NextResponse } from "next/server";
import { REFRESH_COOKIE } from "@/lib/auth-cookies";
import { loginUrlWithNext } from "@/lib/safe-next";

export default function proxy(request: NextRequest) {
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  const { pathname } = request.nextUrl;
  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/register");

  // Password recovery is reachable signed in or not: a reset link can be
  // opened in a browser that still holds an (about to be revoked) session.
  if (pathname.startsWith("/forgot-password") || pathname.startsWith("/reset-password")) {
    return NextResponse.next();
  }

  // The landing page is for visitors; signed-in users go straight to their dashboard.
  if (pathname === "/") {
    return refresh ? NextResponse.redirect(new URL("/dashboard", request.url)) : NextResponse.next();
  }

  // Not logged in and trying to reach an app route → bounce to /login.
  if (!refresh && !isAuthRoute) {
    const login = new URL(loginUrlWithNext(pathname + request.nextUrl.search), request.url);
    return NextResponse.redirect(login);
  }

  // Already logged in but arriving on /login?mcp_authorize=… from the MCP OAuth
  // flow → don't bounce to the dashboard; resume the bridge directly.
  const mcpAuthorize = request.nextUrl.searchParams.get("mcp_authorize");
  if (refresh && isAuthRoute && mcpAuthorize) {
    return NextResponse.redirect(
      new URL(
        `/api/auth/mcp-handoff?continue=${encodeURIComponent(mcpAuthorize)}`,
        request.url,
      ),
    );
  }

  // Logged in but on an auth route → send to the dashboard.
  if (refresh && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets, the image optimizer, favicon, and /api/*.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
