import { forgetPendingSignup, pendingSignupFor, rememberPendingSignup } from '@/lib/pending-signup';

describe('pending sign-up', () => {
  afterEach(() => forgetPendingSignup());

  it('returns the sign-up only for the same email, ignoring case and spaces', () => {
    rememberPendingSignup({ email: 'Sam@Example.com', password: 'long-enough-1' });

    expect(pendingSignupFor(' sam@example.com ')).toEqual({ email: 'Sam@Example.com', password: 'long-enough-1' });
    expect(pendingSignupFor('other@example.com')).toBeNull();
    expect(pendingSignupFor(undefined)).toBeNull();
  });

  it('is gone once forgotten', () => {
    rememberPendingSignup({ email: 'a@b.com', password: 'long-enough-1' });
    forgetPendingSignup();
    expect(pendingSignupFor('a@b.com')).toBeNull();
  });
});
