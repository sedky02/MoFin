import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  BACKEND_URL,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
  refreshUnavailableResponse,
  requestRefresh,
  type BackendTokens,
  type RefreshOutcome,
} from "@/lib/auth-cookies";

//export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

// This proxy sits in the user-facing request path, so a hung backend must not
// hang every dashboard load — a short timeout turns "spinner forever" into an
// explicit, actionable 504 (audit PERF-XX).
const PROXY_TIMEOUT_MS = 8_000;

// ---- Module-level refresh lock ----
// Concurrent 401s for the SAME refresh token share one in-flight refresh so we
// don't stampede /auth/refresh. Keyed by refresh token so different users'
// requests (which race on a shared Node process) never share state.
// See RefreshOutcome for what "rejected" vs "unavailable" mean to the session.
//
// A successful rotation stays in the map for REFRESH_REUSE_MS. Requests the
// browser sent before it received the rotated cookies still carry the old
// refresh token, and their 401 can arrive after the refresh has finished.
// Presenting that token to the backend again counts as reuse and revokes the
// whole session, so they get the same new pair instead. Failures are
// released at once so the next 401 can try again.
const REFRESH_REUSE_MS = 30_000;
const refreshPromises = new Map<string, Promise<RefreshOutcome>>();

async function refreshTokens(refreshToken: string, req: Request): Promise<RefreshOutcome> {
  let promise = refreshPromises.get(refreshToken);
  if (!promise) {
    promise = requestRefresh(refreshToken, req).then((outcome) => {
      if (outcome.kind === "ok") {
        setTimeout(() => refreshPromises.delete(refreshToken), REFRESH_REUSE_MS).unref?.();
      } else {
        refreshPromises.delete(refreshToken); // release so a later 401 can refresh again
      }
      return outcome;
    });
    refreshPromises.set(refreshToken, promise);
  }
  return promise;
}

// ---- Forwarding ----
async function forward(
  req: Request,
  targetPath: string,
  accessToken: string | undefined,
  requestId: string,
): Promise<Response> {
  const url = new URL(req.url);
  const target = `${BACKEND_URL}/${targetPath}${url.search}`;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  // Relay the real client IP so the backend's rate limiter (which trusts this
  // one BFF hop) sees individual users instead of this server's single IP.
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  // Lets one request be traced across both processes' logs (audit OBS-01).
  headers.set("x-request-id", requestId);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : undefined;

  try {
    return await fetch(target, {
      method: req.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
  } catch (err) {
    // Explicit 504 instead of letting the route handler throw (which Next
    // would turn into a generic, indistinguishable 500) — this is what lets
    // handleApiError on the client tell "slow" apart from "broken".
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return Response.json(
      {
        statusCode: 504,
        message: timedOut
          ? "The server is taking too long to respond."
          : "Could not reach the backend.",
      },
      { status: 504 },
    );
  }
}

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params; // Next.js 16: params are async
  const targetPath = path.map(encodeURIComponent).join("/");
  // One id per client request, reused across the initial attempt and the
  // post-refresh retry, so both backend log lines correlate to this one call.
  const requestId = crypto.randomUUID();

  const cookieStore = await cookies(); // Next.js 16: cookies() is async
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  // We can only read the body once; clone for a potential retry.
  const reqForFirst = req.clone();
  const upstream = await forward(reqForFirst, targetPath, accessToken, requestId);

  if (upstream.status !== 401) {
    return passthrough(upstream, requestId);
  }

  // 401 → try one refresh (deduped via the module lock), then retry once.
  if (!refreshToken) {
    return clearedUnauthorized();
  }

  const outcome = await refreshTokens(refreshToken, req);
  if (outcome.kind === "rejected") {
    return clearedUnauthorized();
  }
  if (outcome.kind === "unavailable") {
    // Keep the cookies: the session may be perfectly valid, the backend was
    // just rate limiting, down or slow. The client can retry instead of being
    // logged out.
    return refreshUnavailableResponse(outcome.retryAfter);
  }

  const { tokens } = outcome;
  const retry = await forward(req.clone(), targetPath, tokens.accessToken, requestId);
  const res = await passthrough(retry, requestId);
  // Rotate cookies onto the retried response.
  applyTokenCookies(res, tokens);
  return res;
}

// Stream the upstream response straight back to the client.
async function passthrough(upstream: Response, requestId: string): Promise<NextResponse> {
  const bodyText = await upstream.text();
  const res = new NextResponse(bodyText || null, { status: upstream.status });
  const ct = upstream.headers.get("content-type");
  if (ct) res.headers.set("content-type", ct);
  // Lets a report from the user reference this id to find the matching
  // backend log line without needing DB/timestamp correlation.
  res.headers.set("x-request-id", requestId);
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
