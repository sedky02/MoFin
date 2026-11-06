import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  BACKEND_URL,
  clearAuthCookies,
  refreshUnavailableResponse,
  requestRefresh,
  setAuthCookies,
  type BackendTokens,
  type RefreshOutcome,
} from "@/lib/auth-cookies";
import { bffHeaders } from "@/lib/bff-headers";

type Ctx = { params: Promise<{ path: string[] }> };

// A hung backend must not hang every dashboard load: a short timeout becomes an explicit 504.
const PROXY_TIMEOUT_MS = 8_000;
// The assistant calls a language model (the chat may make several round trips
// to it), which routinely takes longer than 8 s.
const AI_PROXY_TIMEOUT_MS = 60_000;

function timeoutFor(targetPath: string): number {
  return targetPath === "ai" || targetPath.startsWith("ai/") ? AI_PROXY_TIMEOUT_MS : PROXY_TIMEOUT_MS;
}

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
  // Lets the backend's rate limiter see the real client, not this server.
  for (const [name, value] of Object.entries(bffHeaders(req))) headers.set(name, value);
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
      signal: AbortSignal.timeout(timeoutFor(targetPath)),
    });
  } catch (err) {
    // Explicit 504, so handleApiError can tell "slow" from "broken" instead of a generic 500.
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

  const reqForFirst = req.clone();
  const upstream = await forward(reqForFirst, targetPath, accessToken, requestId);

  if (upstream.status !== 401) {
    return passthrough(upstream, requestId);
  }

  if (!refreshToken) {
    return clearedUnauthorized();
  }

  const outcome = await refreshTokens(refreshToken, req);
  if (outcome.kind === "rejected") {
    return clearedUnauthorized();
  }
  if (outcome.kind === "unavailable") {
    // Keep the cookies: the session may be valid and the backend just rate limiting, down or slow,
    // so the client can retry instead of being logged out.
    return refreshUnavailableResponse(outcome.retryAfter);
  }

  const { tokens } = outcome;
  const retry = await forward(req.clone(), targetPath, tokens.accessToken, requestId);
  const res = await passthrough(retry, requestId);
  applyTokenCookies(res, tokens);
  return res;
}

// Upstream headers the browser needs. Content-Disposition makes a download
// (the data export) save under the backend's filename instead of rendering.
const PASSTHROUGH_HEADERS = ["content-type", "content-disposition"];

// Stream the upstream response straight back to the client. Bodiless
// statuses must get a null body, or the Response constructor throws.
async function passthrough(upstream: Response, requestId: string): Promise<NextResponse> {
  const bodiless = upstream.status === 204 || upstream.status === 304;
  const res = new NextResponse(bodiless ? null : upstream.body, { status: upstream.status });
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) res.headers.set(name, value);
  }
  // Lets a user's report reference this id to find the backend log line.
  res.headers.set("x-request-id", requestId);
  return res;
}

function applyTokenCookies(res: NextResponse, tokens: BackendTokens) {
  setAuthCookies(res, tokens);
}

function clearedUnauthorized(): NextResponse {
  const res = NextResponse.json(
    { statusCode: 401, message: "Session expired." },
    { status: 401 },
  );
  clearAuthCookies(res);
  return res;
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
