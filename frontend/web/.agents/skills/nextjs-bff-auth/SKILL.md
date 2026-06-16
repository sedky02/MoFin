---
name: nextjs-bff-auth
description: BFF (backend-for-frontend) auth for Next.js 16 — httpOnly cookies, async cookies()/params, a proxy route handler with a module-level refresh lock, and proxy.ts (the middleware.ts replacement). Use for anything under app/api/*, the backend proxy, proxy.ts, or cookie handling.
---

# Next.js 16 BFF Auth

The browser NEVER sees tokens. Tokens live in httpOnly cookies. All client code talks to
`/api/backend/*`; only route handlers under `app/api/*` know `BACKEND_URL`.

## Cookies (Next.js 16: `cookies()` is async)

`cookies()` from `next/headers` returns a Promise — always `await` it. This is NOT the same as
`NextRequest.cookies` inside `proxy.ts`, which is synchronous.

```ts
import { cookies } from "next/headers";

const cookieStore = await cookies();          // ALWAYS await
const token = cookieStore.get("access_token")?.value;
```

httpOnly cookie helper (set on a `NextResponse` so it is sent to the browser):

```ts
function setAuthCookie(res: NextResponse, name: string, value: string, maxAge: number) {
  res.cookies.set(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // false in dev, true in prod — never hardcode
    sameSite: "lax",
    path: "/",
    maxAge, // seconds
  });
}
```

Token lifetimes: `access_token` ~15 min (`maxAge: 60 * 15`), `refresh_token` ~30 days
(`maxAge: 60 * 60 * 24 * 30`).

## Auth route handlers

Each must be `export const dynamic = "force-dynamic"` to opt out of static inference.

- `POST /api/auth/login`, `/api/auth/register`: call backend, set both httpOnly cookies, return
  ONLY safe user info (never the tokens) to the client.
- `POST /api/auth/logout`: clear both cookies (`maxAge: 0`), return 200.
- `POST /api/auth/refresh`: call backend `/auth/refresh`, rotate both cookies.

## Backend proxy: `app/api/backend/[...path]/route.ts`

- `export const dynamic = "force-dynamic"`.
- Route handler params are async — `const { path } = await params`.
- Forward method + body + content-type; attach `Authorization: Bearer <access_token cookie>`.
- All backend `fetch()` use `{ cache: "no-store" }` (Next.js 16 caching is opt-in; without
  `"use cache"` everything is dynamic, but be explicit on the proxy).
- On `401`: acquire a module-level refresh lock so concurrent 401s trigger only ONE refresh,
  update both cookies on success, retry the original request ONCE; on refresh failure clear
  cookies and return 401 to the client.

The refresh lock is a module-level `Promise | null`:

```ts
let refreshPromise: Promise<RefreshResult> | null = null;

async function refreshTokens(refreshToken: string): Promise<RefreshResult> {
  if (!refreshPromise) {
    refreshPromise = doRefresh(refreshToken).finally(() => {
      refreshPromise = null; // clear so the next 401 can refresh again
    });
  }
  return refreshPromise; // concurrent callers await the same in-flight refresh
}
```

Because the proxy cannot mutate request cookies after streaming, collect the rotated tokens and
`Set-Cookie` them on the final `NextResponse`.

## `proxy.ts` (replaces `middleware.ts`)

File is named `proxy.ts`; the export is `proxy` (default function). The Edge `middleware.ts`
still exists but is deprecated — do not use it.

```ts
import { NextRequest, NextResponse } from "next/server";

export default function proxy(request: NextRequest) {
  // NextRequest.cookies is SYNCHRONOUS here (not the async cookies() from next/headers)
  const refresh = request.cookies.get("refresh_token")?.value;
  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/register");

  if (!refresh && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (refresh && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // exclude _next/static, _next/image, favicon.ico, and /api/*
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
```

Gate only the app routes on `refresh_token` presence; bounce logged-in users away from
`/login` and `/register`. Absolute redirects can use `NEXT_PUBLIC_APP_URL`.

## Environment

- `BACKEND_URL` — server-only base URL (e.g. `http://localhost:3000/api/v1`).
- `NEXT_PUBLIC_APP_URL` — for absolute redirects.
- Node.js minimum 20.9+. Do not use APIs unavailable before 20.9.
