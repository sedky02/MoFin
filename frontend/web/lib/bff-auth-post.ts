import { NextResponse } from "next/server";
import { bffHeaders } from "@/lib/bff-headers";
import { BACKEND_TIMEOUT_MS, BACKEND_URL } from "@/lib/auth-cookies";

export type BackendPost =
  | { ok: true; status: number; data: Record<string, unknown> }
  | { ok: false; response: NextResponse };

/**
 * POSTs JSON to a public backend auth route. A failed or slow backend becomes an explicit 504 so
 * the client can tell "slow" from a generic failure; a backend error is passed through as is.
 */
export async function postToBackend(req: Request, path: string, body: unknown): Promise<BackendPost> {
  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...bffHeaders(req) },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      ok: false,
      response: NextResponse.json(
        { statusCode: 504, message: timedOut ? "The server is taking too long to respond." : "Could not reach the backend." },
        { status: 504 },
      ),
    };
  }

  const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
  if (!upstream.ok) return { ok: false, response: NextResponse.json(data, { status: upstream.status }) };
  return { ok: true, status: upstream.status, data };
}
