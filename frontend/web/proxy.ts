// Next.js 16: proxy.ts REPLACES middleware.ts. The exported function is `proxy`.
// NextRequest.cookies here is SYNCHRONOUS (not the async cookies() from next/headers).
import { NextRequest, NextResponse } from "next/server";
import { REFRESH_COOKIE } from "@/lib/auth-cookies";

export default function proxy(request: NextRequest) {
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  const { pathname } = request.nextUrl;
  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/register");

  // Not logged in and trying to reach an app route → bounce to /login.
  if (!refresh && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
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
