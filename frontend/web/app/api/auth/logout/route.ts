import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BACKEND_TIMEOUT_MS, BACKEND_URL, REFRESH_COOKIE, clearAuthCookies } from "@/lib/auth-cookies";

//export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    // Revoke server-side before clearing cookies, so a copy of this refresh
    // token (stolen before logout) stops working too, not just this browser.
    try {
      await fetch(`${BACKEND_URL}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
        signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
      });
    } catch {
      // Best-effort: logout must still clear cookies even if the backend is
      // unreachable or times out — never hang the user's logout on it.
    }
  }

  const res = NextResponse.json({ ok: true });
  clearAuthCookies(res);
  return res;
}
