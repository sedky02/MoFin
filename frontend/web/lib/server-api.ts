// Server-side backend fetch for Server Component prefetching (dashboard).
// Calls BACKEND_URL directly with the access_token cookie. All financial data is
// dynamic — never cached, never wrapped in "use cache" (it is user-specific).
import { cookies } from "next/headers";
import { ACCESS_COOKIE, BACKEND_URL } from "@/lib/auth-cookies";

/**
 * Fetch JSON from the backend on the server. On any non-OK status (including 401),
 * returns null — the client query will re-fetch through the proxy, which performs
 * the refresh. Prefetch is a best-effort optimization, so we never throw here.
 */
export async function serverGet<T>(
  path: string,
  searchParams?: Record<string, string | number | undefined>,
): Promise<T | null> {
  const cookieStore = await cookies(); // Next.js 16: async
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return null;

  const qs = new URLSearchParams();
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
  }
  const clean = path.startsWith("/") ? path : `/${path}`;
  const url = `${BACKEND_URL}${clean}${qs.toString() ? `?${qs}` : ""}`;

  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
