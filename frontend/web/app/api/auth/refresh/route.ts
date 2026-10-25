import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
    REFRESH_COOKIE,
    setAuthCookies,
    clearAuthCookies,
    refreshUnavailableResponse,
    requestRefresh,
} from "@/lib/auth-cookies";

//export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cookieStore = await cookies(); // Next.js 16: cookies() is async
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json({ statusCode: 401, message: "No session." }, { status: 401 });
  }

  const outcome = await requestRefresh(refreshToken, req);

  if (outcome.kind === "unavailable") {
    // Rate limited or the backend is down: keep the session for a retry.
    return refreshUnavailableResponse(outcome.retryAfter);
  }

  if (outcome.kind === "rejected") {
    const res = NextResponse.json(
      { statusCode: 401, message: "Session expired." },
      { status: 401 },
    );
    clearAuthCookies(res);
    return res;
  }

  const res = NextResponse.json({ ok: true });
  setAuthCookies(res, outcome.tokens);
  return res;
}
