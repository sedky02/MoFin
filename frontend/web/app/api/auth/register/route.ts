import { NextResponse } from "next/server";
import { bffHeaders } from "@/lib/bff-headers";
import { BACKEND_TIMEOUT_MS, BACKEND_URL } from "@/lib/auth-cookies";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json(
      { statusCode: 400, message: "Email and password are required." },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...bffHeaders(req) },
      body: JSON.stringify({
        email: body.email,
        password: body.password,
        ...(body.displayName ? { displayName: body.displayName } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return NextResponse.json(
      { statusCode: 504, message: timedOut ? "The server is taking too long to respond." : "Could not reach the backend." },
      { status: 504 },
    );
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  // No auto-login: the backend returns the same body whether or not the email existed, so there are
  // no tokens to set; the client logs in separately.
  return NextResponse.json(data);
}
