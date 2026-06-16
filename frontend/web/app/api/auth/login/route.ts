import { NextResponse } from "next/server";
import { BACKEND_URL, setAuthCookies, type BackendTokens } from "@/lib/auth-cookies";

//export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json(
      { statusCode: 400, message: "Email and password are required." },
      { status: 400 },
    );
  }

  const upstream = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: body.email, password: body.password }),
    cache: "no-store",
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  const tokens = data as BackendTokens;
  // Return only safe info; tokens go into httpOnly cookies, never the body.
  const res = NextResponse.json({ ok: true });
  setAuthCookies(res, tokens);
  return res;
}
