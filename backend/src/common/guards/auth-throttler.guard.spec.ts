import { AuthThrottlerGuard } from './auth-throttler.guard';

describe('AuthThrottlerGuard.getTracker', () => {
  // getTracker is protected; access it the same way the base class calls it internally.
  const getTracker = (AuthThrottlerGuard.prototype as unknown as {
    getTracker(req: Record<string, unknown>): Promise<string>;
  }).getTracker;

  it('keys on IP + normalized submitted email, not IP alone', async () => {
    const tracker = await getTracker({ ip: '1.2.3.4', body: { email: '  Foo@Example.com ' } });
    expect(tracker).toBe('1.2.3.4:foo@example.com');
  });

  it('two different emails from the same IP get different trackers', async () => {
    const a = await getTracker({ ip: '1.2.3.4', body: { email: 'a@x.com' } });
    const b = await getTracker({ ip: '1.2.3.4', body: { email: 'b@x.com' } });
    expect(a).not.toBe(b);
  });

  it('falls back to IP alone when there is no email in the body (e.g. /auth/refresh)', async () => {
    const tracker = await getTracker({ ip: '5.6.7.8', body: { refreshToken: 'x' } });
    expect(tracker).toBe('5.6.7.8:');
  });

  it('does not throw when body is missing entirely', async () => {
    await expect(getTracker({ ip: '5.6.7.8' })).resolves.toBe('5.6.7.8:');
  });
});
