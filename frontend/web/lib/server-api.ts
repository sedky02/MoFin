// Server-side backend fetch for Server Component prefetching (dashboard).
// Calls BACKEND_URL directly with the access_token cookie. All financial data is
// dynamic — never cached, never wrapped in "use cache" (it is user-specific).
import { cookies } from "next/headers";
import { ACCESS_COOKIE, BACKEND_URL } from "@/lib/auth-cookies";

/** Server-to-server calls must never hang indefinitely (audit PERF-XX). */
const BACKEND_TIMEOUT_MS = 5_000;

/**
 * Thrown by serverGet for a failure that is NOT a routine "access token
 * expired" (401) — a genuine backend outage, a 5xx, a network error, or a
 * timeout. The dashboard route's error.tsx boundary catches this and shows a
 * real error instead of silently rendering a confident, wrong "$0.00"
 * dashboard. `timedOut` lets callers show "slow" rather than "broken".
 */
export class ServerPrefetchError extends Error {
  constructor(
    message: string,
    readonly timedOut = false,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ServerPrefetchError";
  }
}

/**
 * Fetch JSON from the backend on the server. Returns null for a routine,
 * client-recoverable outcome: no access token cookie, a 401 from an expired
 * one (the client query re-fetches through the proxy, which performs the
 * refresh), or any other 4xx (e.g. 404) that the calling page's own
 * client-side query already knows how to render (not found, forbidden, ...).
 * Only a genuine backend outage — a network error or a 5xx — throws
 * ServerPrefetchError, since silently returning null for THAT would render as
 * an empty/zero dashboard indistinguishable from "the user has no data".
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

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new ServerPrefetchError(
      timedOut ? `Backend timed out for ${clean}` : `Could not reach the backend for ${clean}`,
      timedOut,
      err,
    );
  }

  if (res.status >= 500) {
    throw new ServerPrefetchError(`Backend returned ${res.status} for ${clean}`);
  }
  if (!res.ok) return null;
  return (await res.json()) as T;
}
