import type { IncomingMessage, ServerResponse } from 'node:http';
import { customLogLevel, customProps, genReqId } from './pino-options';

function makeReq(headers: Record<string, string | string[] | undefined> = {}, user?: { id?: string }) {
  return { headers, user } as unknown as IncomingMessage & { user?: { id?: string } };
}

describe('genReqId', () => {
  it('reuses the BFF-propagated x-request-id header', () => {
    expect(genReqId(makeReq({ 'x-request-id': 'abc-123' }))).toBe('abc-123');
  });

  it('takes the first value when the header repeats', () => {
    expect(genReqId(makeReq({ 'x-request-id': ['first', 'second'] }))).toBe('first');
  });

  it('generates a fresh id when the header is absent', () => {
    const id = genReqId(makeReq({}));
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('customProps', () => {
  it('includes userId once the request has an authenticated user', () => {
    expect(customProps(makeReq({}, { id: 'user-1' }))).toEqual({ userId: 'user-1' });
  });

  it('is empty for an unauthenticated request', () => {
    expect(customProps(makeReq({}))).toEqual({});
  });
});

describe('customLogLevel', () => {
  function makeRes(statusCode: number) {
    return { statusCode } as ServerResponse;
  }

  it('logs 5xx responses at error', () => {
    expect(customLogLevel(makeRes(503), undefined)).toBe('error');
  });

  it('logs an error object at error regardless of status', () => {
    expect(customLogLevel(makeRes(200), new Error('boom'))).toBe('error');
  });

  it('logs 4xx responses at warn', () => {
    expect(customLogLevel(makeRes(404), undefined)).toBe('warn');
  });

  it('logs successful responses at info', () => {
    expect(customLogLevel(makeRes(200), undefined)).toBe('info');
  });
});
