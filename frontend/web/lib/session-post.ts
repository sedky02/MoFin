// Server-only: POSTs (or DELETEs) to an authenticated backend route as the
// signed-in user, for BFF routes the generic proxy can't serve: the backend
// needs the session's refresh token in the body (only this server can read
// the cookie), or the route has to change the auth cookies afterwards.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  BACKEND_TIMEOUT_MS,
  BACKEND_URL,
  REFRESH_COOKIE,
  clearAuthCookies,
  forwardedForHeader,
  refreshUnavailableResponse,
  requestRefresh,
  setAuthCookies,
  type BackendTokens,
} from "@/lib/auth-cookies";

export interface SessionPostResult {
  /** The response for the browser: the backend's status and body, plus any cookie changes. */
  res: NextResponse;
  /** True when the backend accepted the request (2xx). */
  ok: boolean;
}

/**
 * Sends `body(refreshToken)` to `${BACKEND_URL}/${path}` with the access
 * token from the cookie. A 401 is handled like the proxy does: one refresh,
 * then one retry with the rotated pair (and the rotated refresh token in the
 * body), which is set on the response. A rejected refresh ends the session
 * (401, cookies cleared); a rate-limited or unreachable one keeps it (503).
 */
export async function postAsSession(
  req: Request,
  path: string,
  body: (refreshToken: string | undefined) => object,
  method: "POST" | "DELETE" = "POST",
): Promise<SessionPostResult> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  const post = (token: string, payload: object) => send(req, method, path, token, payload);

  let upstream = accessToken ? await post(accessToken, body(refreshToken)) : undefined;
  let rotated: BackendTokens | undefined;

  if (!upstream || upstream.status === 401) {
    if (!refreshToken) return { res: sessionExpired(), ok: false };
    const outcome = await requestRefresh(refreshToken, req);
    if (outcome.kind === "rejected") return { res: sessionExpired(), ok: false };
    if (outcome.kind === "unavailable") {
      return { res: refreshUnavailableResponse(outcome.retryAfter), ok: false };
    }
    rotated = outcome.tokens;
    upstream = await post(rotated.accessToken, body(rotated.refreshToken));
    if (upstream.status === 401) return { res: sessionExpired(), ok: false };
  }

  const text = await upstream.text();
  const res = new NextResponse(upstream.status === 204 ? null : text || null, { status: upstream.status });
  const contentType = upstream.headers.get("content-type");
  if (contentType && upstream.status !== 204) res.headers.set("content-type", contentType);
  if (rotated) setAuthCookies(res, rotated);
  return { res, ok: upstream.ok };
}

async function send(
  req: Request,
  method: "POST" | "DELETE",
  path: string,
  accessToken: string,
  body: object,
): Promise<Response> {
  try {
    return await fetch(`${BACKEND_URL}/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${accessToken}`,
        ...forwardedForHeader(req),
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return Response.json(
      { statusCode: 504, message: timedOut ? "The server is taking too long to respond." : "Could not reach the backend." },
      { status: 504 },
    );
  }
}

function sessionExpired(): NextResponse {
  const res = NextResponse.json({ statusCode: 401, message: "Session expired." }, { status: 401 });
  clearAuthCookies(res);
  return res;
}
