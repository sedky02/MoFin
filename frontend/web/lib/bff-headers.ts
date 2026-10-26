// Server-only: headers every server-to-server call to the backend carries.
// Reads BFF_SHARED_SECRET, which must never reach the browser (no NEXT_PUBLIC_).

/** Proves to the backend that a request comes from this BFF. */
export const BFF_SECRET_HEADER = "x-mofin-bff-secret";

/** The client IP this BFF saw; the backend only trusts it next to the secret. */
export const CLIENT_IP_HEADER = "x-mofin-client-ip";

/**
 * The IP of the browser that called this BFF. On Vercel the edge overwrites
 * X-Forwarded-For with the client's address, so its first entry is the
 * client; X-Real-IP carries the same value and is the fallback.
 */
export function clientIp(incoming: Headers): string | undefined {
  const forwarded = incoming.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return incoming.get("x-real-ip")?.trim() || undefined;
}

/**
 * Headers that let the backend's rate limiter see the real client instead of
 * this server. Deployed, a second edge hop sits between the BFF and the
 * backend, so the backend's own X-Forwarded-For handling resolves every
 * request to this server's egress IP; the client IP travels in
 * CLIENT_IP_HEADER instead, vouched for by BFF_SHARED_SECRET.
 *
 * X-Forwarded-For is still relayed: without a secret configured (local
 * development) the backend falls back to it, as it always has.
 *
 * `incoming` is the browser's request, or the incoming headers in a Server
 * Component. Without it only the secret is sent.
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
