import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  BACKEND_URL,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
  type BackendTokens,
} from "@/lib/auth-cookies";

//export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

// ---- Module-level refresh lock ----
// Concurrent 401s share ONE in-flight refresh so we never stampede /auth/refresh.
let refreshPromise: Promise<BackendTokens | null> | null = null;

async function refreshTokens(refreshToken: string): Promise<BackendTokens | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh(refreshToken).finally(() => {
      refreshPromise = null; // release so a later 401 can refresh again
    });
  }
  return refreshPromise;
}

async function doRefresh(refreshToken: string): Promise<BackendTokens | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as BackendTokens;
  } catch {
    return null;
  }
}

// ---- Forwarding ----
async function forward(
  req: Request,
  targetPath: string,
  accessToken: string | undefined,
): Promise<Response> {
  const url = new URL(req.url);
  const target = `${BACKEND_URL}/${targetPath}${url.search}`;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : undefined;

  return fetch(target, {
    method: req.method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
    cache: "no-store",
  });
}

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params; // Next.js 16: params are async
  const targetPath = path.map(encodeURIComponent).join("/");

  const cookieStore = await cookies(); // Next.js 16: cookies() is async
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  // We can only read the body once; clone for a potential retry.
  const reqForFirst = req.clone();
  let upstream = await forward(reqForFirst, targetPath, accessToken);

  if (upstream.status !== 401) {
    return passthrough(upstream);
  }

  // 401 → try one refresh (deduped via the module lock), then retry once.
  if (!refreshToken) {
    return clearedUnauthorized();
  }

  const tokens = await refreshTokens(refreshToken);
  if (!tokens) {
    return clearedUnauthorized();
  }

  const retry = await forward(req.clone(), targetPath, tokens.accessToken);
  const res = await passthrough(retry);
  // Rotate cookies onto the retried response.
  applyTokenCookies(res, tokens);
  return res;
}

// Stream the upstream response straight back to the client.
async function passthrough(upstream: Response): Promise<NextResponse> {
  const bodyText = await upstream.text();
  const res = new NextResponse(bodyText || null, { status: upstream.status });
  const ct = upstream.headers.get("content-type");
  if (ct) res.headers.set("content-type", ct);
  return res;
}

function applyTokenCookies(res: NextResponse, tokens: BackendTokens) {
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE,
  });
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE,
  });
}

function clearedUnauthorized(): NextResponse {
  const res = NextResponse.json(
    { statusCode: 401, message: "Session expired." },
    { status: 401 },
  );
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
