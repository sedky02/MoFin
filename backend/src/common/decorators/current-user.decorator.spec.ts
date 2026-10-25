import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { currentUserFromContext } from './current-user.decorator';

function contextWith(request: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('currentUserFromContext', () => {
  it('returns the authenticated user', () => {
    const user = { id: 'user-1', email: 'a@example.com' };
    expect(currentUserFromContext(contextWith({ user }))).toBe(user);
  });

  it.each([
    ['no user', {}],
    ['a null user', { user: null }],
    ['a user without an id', { user: { email: 'a@example.com' } }],
    ['an empty id', { user: { id: '', email: 'a@example.com' } }],
    ['a non-string id', { user: { id: 42, email: 'a@example.com' } }],
  ])('throws 401 with %s', (_label, request) => {
    expect(() => currentUserFromContext(contextWith(request))).toThrow(UnauthorizedException);
  });
});
