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
 * Constant-time comparison. Both sides are hashed first so the buffers are
 * always the same length and a wrong guess leaks neither content nor length.
 */
function secretMatches(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * The client IP the BFF vouches for, or undefined when the request didn't
 * come from the BFF (no secret configured, missing or wrong secret) or the
 * claimed IP isn't a valid address.
 */
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
 * Takes the real client IP from the BFF instead of the network hop.
 *
 * In production both apps sit behind Vercel's edge, so the path is client →
 * edge → BFF → edge → backend, and `trust proxy 1` resolves `req.ip` to the
 * BFF's egress IP for every user, collapsing every per-IP rate limit onto one
 * bucket. The BFF sends the client IP it saw in `x-mofin-client-ip`, signed
 * off by the shared `BFF_SHARED_SECRET`; when the secret matches, that IP
 * replaces `req.ip` on this request, so every throttler tracker (the global
 * baseline and the route guards, which all read `req.ip`) keys on the real
 * client. Without a matching secret the header is a spoof attempt and is
 * ignored, and `req.ip` stays what `trust proxy` resolved.
 *
 * Both headers are removed afterwards, whatever the outcome, so nothing
 * downstream (handlers, request logs) ever sees the secret.
 *
 * Registered with `app.use` in main.ts, before Nest's own middleware and
 * guards.
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
