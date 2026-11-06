// Server-only: POSTs/DELETEs to an authenticated backend route as the signed-in user, for BFF
// routes the generic proxy can't serve (the backend needs the refresh token in the body).
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  BACKEND_TIMEOUT_MS,
  BACKEND_URL,
  REFRESH_COOKIE,
  clearAuthCookies,
  refreshUnavailableResponse,
  requestRefresh,
  setAuthCookies,
  type BackendTokens,
} from "@/lib/auth-cookies";
import { bffHeaders } from "@/lib/bff-headers";

export interface SessionPostResult {
  res: NextResponse;
  ok: boolean;
}

/**
 * Sends `body(refreshToken)` with the access token from the cookie; a 401 is handled like the
 * proxy: one refresh, then one retry with the rotated pair.
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
        ...bffHeaders(req),
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
