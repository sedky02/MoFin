import { ThrottlerRequest } from '@nestjs/throttler';
import { sha256 } from '../utils/hash';
import {
  AUTH_THROTTLE,
  AuthThrottlerGuard,
  CHANGE_PASSWORD_THROTTLE,
  ChangePasswordThrottlerGuard,
  FORGOT_PASSWORD_THROTTLE,
  ForgotPasswordThrottlerGuard,
  authTracker,
  userTracker,
} from './auth-throttler.guard';

describe('authTracker', () => {
  it('keys on IP + normalized submitted email, not IP alone', () => {
    expect(
      authTracker({ ip: '1.2.3.4', body: { email: '  Foo@Example.com ' } }),
    ).toBe('1.2.3.4:foo@example.com');
  });

  it('two different emails from the same IP get different trackers', () => {
    const a = authTracker({ ip: '1.2.3.4', body: { email: 'a@x.com' } });
    const b = authTracker({ ip: '1.2.3.4', body: { email: 'b@x.com' } });
    expect(a).not.toBe(b);
  });

  it('the same email from different IPs gets different trackers', () => {
    const a = authTracker({ ip: '1.2.3.4', body: { email: 'a@x.com' } });
    const b = authTracker({ ip: '5.6.7.8', body: { email: 'a@x.com' } });
    expect(a).not.toBe(b);
  });

  it('keys a reset-password body on a hash of the presented token', () => {
    expect(
      authTracker({ ip: '1.2.3.4', body: { token: 'reset-a', password: 'x' } }),
    ).toBe(`reset:${sha256('reset-a')}`);
  });

  it('never puts the raw reset token in the key', () => {
    expect(
      authTracker({ ip: '1.2.3.4', body: { token: 'super-secret-token' } }),
    ).not.toContain('super-secret-token');
  });

  it('gives different reset tokens from the same IP different trackers', () => {
    const a = authTracker({ ip: '1.2.3.4', body: { token: 'reset-a' } });
    const b = authTracker({ ip: '1.2.3.4', body: { token: 'reset-b' } });
    expect(a).not.toBe(b);
  });

  it.each([
    ['no body', { ip: '5.6.7.8' }],
    ['no email or token', { ip: '5.6.7.8', body: { refreshToken: 'x' } }],
    ['an empty token', { ip: '5.6.7.8', body: { token: '' } }],
    ['a non-string email', { ip: '5.6.7.8', body: { email: 42 } }],
    ['a non-string token', { ip: '5.6.7.8', body: { token: 42 } }],
  ])('falls back to the IP with %s', (_label, req) => {
    expect(authTracker(req)).toBe('ip:5.6.7.8');
  });
});

describe('AuthThrottlerGuard', () => {
  const parent = Object.getPrototypeOf(AuthThrottlerGuard.prototype) as {
    handleRequest(props: ThrottlerRequest): Promise<boolean>;
  };

  async function forwardedLimits(guardClass: typeof AuthThrottlerGuard) {
    const guard = Object.create(guardClass.prototype) as AuthThrottlerGuard;
    const spy = jest.spyOn(parent, 'handleRequest').mockResolvedValue(true);
    const props = {
      limit: 300,
      ttl: 1_000,
      blockDuration: 1_000,
    } as ThrottlerRequest;
    await (
      guard as unknown as {
        handleRequest(p: ThrottlerRequest): Promise<boolean>;
      }
    ).handleRequest(props);
    const [forwarded] = spy.mock.calls[0];
    spy.mockRestore();
    return forwarded;
  }

  it('uses authTracker as its tracker', async () => {
    const guard = Object.create(
      AuthThrottlerGuard.prototype,
    ) as AuthThrottlerGuard;
    const tracker = await (
      guard as unknown as {
        getTracker(req: Record<string, unknown>): Promise<string>;
      }
    ).getTracker({
      ip: '1.2.3.4',
      body: { email: 'a@x.com' },
    });
    expect(tracker).toBe('1.2.3.4:a@x.com');
  });

  it('applies AUTH_THROTTLE regardless of the route/global limit', async () => {
    expect(await forwardedLimits(AuthThrottlerGuard)).toMatchObject({
      limit: AUTH_THROTTLE.limit,
      ttl: AUTH_THROTTLE.ttl,
      blockDuration: AUTH_THROTTLE.ttl,
    });
  });

  it('ForgotPasswordThrottlerGuard applies FORGOT_PASSWORD_THROTTLE instead', async () => {
    expect(await forwardedLimits(ForgotPasswordThrottlerGuard)).toMatchObject({
      limit: FORGOT_PASSWORD_THROTTLE.limit,
      ttl: FORGOT_PASSWORD_THROTTLE.ttl,
      blockDuration: FORGOT_PASSWORD_THROTTLE.ttl,
    });
  });

  it('ChangePasswordThrottlerGuard applies CHANGE_PASSWORD_THROTTLE, keyed on the user', async () => {
    expect(await forwardedLimits(ChangePasswordThrottlerGuard)).toMatchObject({
      limit: CHANGE_PASSWORD_THROTTLE.limit,
      ttl: CHANGE_PASSWORD_THROTTLE.ttl,
      blockDuration: CHANGE_PASSWORD_THROTTLE.ttl,
    });
    const guard = Object.create(
      ChangePasswordThrottlerGuard.prototype,
    ) as ChangePasswordThrottlerGuard;
    const tracker = await (
      guard as unknown as {
        getTracker(req: Record<string, unknown>): Promise<string>;
      }
    ).getTracker({
      ip: '1.2.3.4',
      user: { id: 'user-1' },
    });
    expect(tracker).toBe('user:user-1');
  });
});

describe('userTracker', () => {
  it('keys on the signed-in user, whatever the IP', () => {
    expect(userTracker({ ip: '1.2.3.4', user: { id: 'u1' } })).toBe('user:u1');
    expect(userTracker({ ip: '5.6.7.8', user: { id: 'u1' } })).toBe('user:u1');
  });

  it.each([
    ['no user', { ip: '5.6.7.8' }],
    ['an empty id', { ip: '5.6.7.8', user: { id: '' } }],
    ['a non-string id', { ip: '5.6.7.8', user: { id: 42 } }],
  ])('falls back to the IP with %s', (_label, req) => {
    expect(userTracker(req)).toBe('ip:5.6.7.8');
  });
});
