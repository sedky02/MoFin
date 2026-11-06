import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

/** Shared secret the BFF sends to prove a request came from it. */
export const BFF_SECRET_HEADER = 'x-mofin-bff-secret';

/** The client IP as the BFF saw it; only trusted next to a valid secret. */
export const CLIENT_IP_HEADER = 'x-mofin-client-ip';

const TRUSTED_HEADERS = new Set([BFF_SECRET_HEADER, CLIENT_IP_HEADER]);

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Constant time; hashing first makes both buffers the same length, so a wrong guess leaks neither
 * content nor length.
 */
function secretMatches(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Undefined unless the request carries a valid BFF secret and a valid IP. */
export function trustedClientIp(
  presentedSecret: string | undefined,
  claimedIp: string | undefined,
  expectedSecret: string | undefined,
): string | undefined {
  if (!expectedSecret || !presentedSecret) return undefined;
  if (!secretMatches(presentedSecret, expectedSecret)) return undefined;
  const ip = claimedIp?.trim();
  return ip && isIP(ip) ? ip : undefined;
}

/**
 * Behind Vercel every request comes from the BFF's egress IP, collapsing per-IP limits into one
 * bucket. The BFF's client IP is trusted only with a matching secret.
 */
export function trustedClientIpMiddleware(expectedSecret: string | undefined) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ip = trustedClientIp(
      headerValue(req, BFF_SECRET_HEADER),
      headerValue(req, CLIENT_IP_HEADER),
      expectedSecret,
    );

    for (const name of TRUSTED_HEADERS) delete req.headers[name];
    req.rawHeaders = req.rawHeaders.filter(
      (_value, i, raw) => !TRUSTED_HEADERS.has(raw[i - (i % 2)].toLowerCase()),
    );

    // Express defines `ip` as a getter on the request prototype; an own
    // property on this request shadows it.
    if (ip)
      Object.defineProperty(req, 'ip', {
        value: ip,
        configurable: true,
        enumerable: true,
      });
    next();
  };
}
