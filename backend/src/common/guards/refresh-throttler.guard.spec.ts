import { ThrottlerRequest } from '@nestjs/throttler';
import { sha256 } from '../utils/hash';
import { REFRESH_THROTTLE, RefreshThrottlerGuard, refreshTokenTracker } from './refresh-throttler.guard';

describe('refreshTokenTracker', () => {
  it('keys on a hash of the presented refresh token, not the IP', () => {
    const tracker = refreshTokenTracker({ ip: '1.2.3.4', body: { refreshToken: 'tok-a' } });
    expect(tracker).toBe(`refresh:${sha256('tok-a')}`);
  });

  it('never puts the raw token in the key', () => {
    const tracker = refreshTokenTracker({ ip: '1.2.3.4', body: { refreshToken: 'super-secret-token' } });
    expect(tracker).not.toContain('super-secret-token');
  });

  it('gives different tokens from the same IP different trackers', () => {
    const a = refreshTokenTracker({ ip: '1.2.3.4', body: { refreshToken: 'tok-a' } });
    const b = refreshTokenTracker({ ip: '1.2.3.4', body: { refreshToken: 'tok-b' } });
    expect(a).not.toBe(b);
  });

  it('gives the same token from different IPs the same tracker', () => {
    const a = refreshTokenTracker({ ip: '1.2.3.4', body: { refreshToken: 'tok-a' } });
    const b = refreshTokenTracker({ ip: '5.6.7.8', body: { refreshToken: 'tok-a' } });
    expect(a).toBe(b);
  });

  it.each([
    ['no body', { ip: '5.6.7.8' }],
    ['no token', { ip: '5.6.7.8', body: {} }],
    ['an empty token', { ip: '5.6.7.8', body: { refreshToken: '' } }],
    ['a non-string token', { ip: '5.6.7.8', body: { refreshToken: 42 } }],
  ])('falls back to the IP with %s', (_label, req) => {
    expect(refreshTokenTracker(req)).toBe('ip:5.6.7.8');
  });
});

describe('RefreshThrottlerGuard', () => {
  it('applies the per-token limit regardless of the route/global limit', async () => {
    const guard = Object.create(RefreshThrottlerGuard.prototype) as RefreshThrottlerGuard;
    const parent = Object.getPrototypeOf(RefreshThrottlerGuard.prototype) as {
      handleRequest(props: ThrottlerRequest): Promise<boolean>;
    };
    const spy = jest.spyOn(parent, 'handleRequest').mockResolvedValue(true);
    const props = { limit: 300, ttl: 1_000, blockDuration: 1_000 } as ThrottlerRequest;

    await (guard as unknown as { handleRequest(p: ThrottlerRequest): Promise<boolean> }).handleRequest(props);

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: REFRESH_THROTTLE.limit,
        ttl: REFRESH_THROTTLE.ttl,
        blockDuration: REFRESH_THROTTLE.ttl,
      }),
    );
    spy.mockRestore();
  });
});
