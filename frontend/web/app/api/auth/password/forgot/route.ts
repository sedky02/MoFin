import { NextResponse } from "next/server";
import { BACKEND_TIMEOUT_MS, BACKEND_URL, forwardedForHeader } from "@/lib/auth-cookies";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.email) {
    return NextResponse.json(
      { statusCode: 400, message: "Email is required." },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/auth/password/forgot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...forwardedForHeader(req) },
      body: JSON.stringify({ email: body.email }),
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

  // The backend answers 202 with the same body whether or not the email has
  // an account; pass it through unchanged so this hop doesn't leak it either.
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
