import type { NextFunction, Request, Response } from 'express';
import {
  BFF_SECRET_HEADER,
  CLIENT_IP_HEADER,
  trustedClientIp,
  trustedClientIpMiddleware,
} from './trusted-client-ip.middleware';

const SECRET = 'a'.repeat(40);

/** A request whose prototype has an `ip` getter, like Express's. */
function fakeRequest(
  headers: Record<string, string>,
  ip = '10.0.0.1',
): Request {
  const proto = {};
  Object.defineProperty(proto, 'ip', { get: () => ip, configurable: true });
  const req = Object.create(proto) as Request;
  req.headers = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  req.rawHeaders = Object.entries(headers).flat();
  return req;
}

function run(secret: string | undefined, headers: Record<string, string>) {
  const req = fakeRequest(headers);
  const next = jest.fn() as NextFunction;
  trustedClientIpMiddleware(secret)(req, {} as Response, next);
  expect(next).toHaveBeenCalledTimes(1);
  return req;
}

describe('trustedClientIpMiddleware', () => {
  it('uses the client IP when the secret is right and the IP is valid', () => {
    const req = run(SECRET, {
      [BFF_SECRET_HEADER]: SECRET,
      [CLIENT_IP_HEADER]: '203.0.113.7',
    });
    expect(req.ip).toBe('203.0.113.7');
  });

  it('accepts an IPv6 client IP', () => {
    const req = run(SECRET, {
      [BFF_SECRET_HEADER]: SECRET,
      [CLIENT_IP_HEADER]: '2001:db8::1',
    });
    expect(req.ip).toBe('2001:db8::1');
  });

  it.each([
    ['not an IP', 'not-an-ip'],
    ['a list of IPs', '203.0.113.7, 198.51.100.1'],
    ['empty', ''],
  ])(
    'keeps req.ip when the secret is right but the client IP is %s',
    (_label, claimed) => {
      const req = run(SECRET, {
        [BFF_SECRET_HEADER]: SECRET,
        [CLIENT_IP_HEADER]: claimed,
      });
      expect(req.ip).toBe('10.0.0.1');
    },
  );

  it('keeps req.ip when the secret is right but no client IP is sent', () => {
    expect(run(SECRET, { [BFF_SECRET_HEADER]: SECRET }).ip).toBe('10.0.0.1');
  });

  it.each([
    ['wrong', { [BFF_SECRET_HEADER]: 'b'.repeat(40) }],
    ['a different length', { [BFF_SECRET_HEADER]: 'short' }],
    ['missing', {}],
  ])('ignores the client IP when the secret is %s', (_label, secretHeader) => {
    const req = run(SECRET, {
      ...secretHeader,
      [CLIENT_IP_HEADER]: '203.0.113.7',
    });
    expect(req.ip).toBe('10.0.0.1');
  });

  it('ignores the client IP when no secret is configured, whatever is sent', () => {
    const req = run(undefined, {
      [BFF_SECRET_HEADER]: SECRET,
      [CLIENT_IP_HEADER]: '203.0.113.7',
    });
    expect(req.ip).toBe('10.0.0.1');
  });

  it.each([
    ['the secret matches', SECRET, SECRET],
    ['the secret is wrong', SECRET, 'b'.repeat(40)],
    ['no secret is configured', undefined, SECRET],
  ])('strips both headers when %s', (_label, configured, presented) => {
    const req = run(configured, {
      'X-Mofin-Bff-Secret': presented,
      'X-Mofin-Client-Ip': '203.0.113.7',
      'Content-Type': 'application/json',
    });
    expect(req.headers).toEqual({ 'content-type': 'application/json' });
    expect(req.rawHeaders).toEqual(['Content-Type', 'application/json']);
  });
});

describe('trustedClientIp', () => {
  it('trims the claimed IP', () => {
    expect(trustedClientIp(SECRET, ' 203.0.113.7 ', SECRET)).toBe(
      '203.0.113.7',
    );
  });

  it('never trusts an empty configured secret', () => {
    expect(trustedClientIp('', '203.0.113.7', '')).toBeUndefined();
  });
});
