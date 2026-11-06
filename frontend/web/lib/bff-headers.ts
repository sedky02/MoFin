// Server-only: BFF_SHARED_SECRET must never reach the browser (no NEXT_PUBLIC_).

/** Proves to the backend that a request comes from this BFF. */
export const BFF_SECRET_HEADER = "x-mofin-bff-secret";

/** The client IP this BFF saw; the backend only trusts it next to the secret. */
export const CLIENT_IP_HEADER = "x-mofin-client-ip";

/**
 * On Vercel the edge overwrites X-Forwarded-For with the client's address, so its first entry is
 * the client; X-Real-IP is the fallback.
 */
export function clientIp(incoming: Headers): string | undefined {
  const forwarded = incoming.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return incoming.get("x-real-ip")?.trim() || undefined;
}

/**
 * Lets the backend's rate limiter see the real client instead of this server: deployed, a second
 * edge hop would otherwise make the backend resolve this server's IP.
 */
export function bffHeaders(incoming?: Request | Headers): Record<string, string> {
  const headers: Record<string, string> = {};
  const secret = process.env.BFF_SHARED_SECRET;
  if (secret) headers[BFF_SECRET_HEADER] = secret;
  if (!incoming) return headers;

  const source = incoming instanceof Request ? incoming.headers : incoming;
  const forwardedFor = source.get("x-forwarded-for");
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  const ip = clientIp(source);
  if (ip) headers[CLIENT_IP_HEADER] = ip;
  return headers;
}
