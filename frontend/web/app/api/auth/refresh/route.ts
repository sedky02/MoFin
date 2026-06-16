import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
    BACKEND_URL,
    REFRESH_COOKIE,
    setAuthCookies,
    clearAuthCookies,
    type BackendTokens,
} from "@/lib/auth-cookies";

//export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies(); // Next.js 16: cookies() is async
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json({ statusCode: 401, message: "No session." }, { status: 401 });
  }

  const upstream = await fetch(`${BACKEND_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });

  if (!upstream.ok) {
    const res = NextResponse.json(
      { statusCode: 401, message: "Session expired." },
      { status: 401 },
    );
    clearAuthCookies(res);
    return res;
  }

  const tokens = (await upstream.json()) as BackendTokens;
  const res = NextResponse.json({ ok: true });
  setAuthCookies(res, tokens);
  return res;
}
