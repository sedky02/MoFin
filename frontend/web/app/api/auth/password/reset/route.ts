import { NextResponse } from "next/server";
import { BACKEND_TIMEOUT_MS, BACKEND_URL, clearAuthCookies, forwardedForHeader } from "@/lib/auth-cookies";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.token || !body?.password) {
    return NextResponse.json(
      { statusCode: 400, message: "Token and password are required." },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/auth/password/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...forwardedForHeader(req) },
      body: JSON.stringify({ token: body.token, password: body.password }),
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

  // A successful reset revokes every refresh token of the account, so any
  // session cookie in this browser is dead now; drop it so the user signs in
  // fresh with the new password.
  const res = NextResponse.json(data);
  clearAuthCookies(res);
  return res;
}
