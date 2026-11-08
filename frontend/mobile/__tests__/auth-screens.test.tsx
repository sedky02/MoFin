import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type * as React from 'react';

import ForgotPasswordScreen from '@/app/(auth)/forgot-password';
import LoginScreen from '@/app/(auth)/login';
import RegisterScreen from '@/app/(auth)/register';
import { getSessionState, resetSessionForTests } from '@/api/session';
import { forgetPendingSignup, pendingSignupFor } from '@/lib/pending-signup';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  return {
    Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
      <Text accessibilityHint={`link to ${href}`}>{children}</Text>
    ),
    useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn() }),
    useLocalSearchParams: () => mockParams,
  };
});

type Call = { url: string; body?: unknown };
let calls: Call[];

function mockFetch(status: number, body?: unknown) {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  resetSessionForTests();
  mockReplace.mockClear();
  mockPush.mockClear();
  forgetPendingSignup();
  mockParams = {};
  calls = [];
});

describe('login', () => {
  it('shows the web validation messages and sends nothing', async () => {
    mockFetch(500);
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email');
    await fireEvent.press(screen.getByText('Sign in'));
    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy();
    expect(screen.getByText('Password is required.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('a 401 says "Incorrect email or password." under the password', async () => {
    mockFetch(401, { statusCode: 401, message: 'Invalid credentials' });
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), ' alex@example.com ');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong-password');
    await fireEvent.press(screen.getByText('Sign in'));
    expect(await screen.findByText('Incorrect email or password.')).toBeTruthy();
    // The email is trimmed before it is sent.
    expect(calls[0].body).toEqual({ email: 'alex@example.com', password: 'wrong-password' });
  });

  it('a 429 shows the rate-limit banner', async () => {
    mockFetch(429, { message: 'Too Many Requests' });
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'alex@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'pw');
    await fireEvent.press(screen.getByText('Sign in'));
    expect(await screen.findByText('Too many attempts. Please wait a moment and try again.')).toBeTruthy();
  });

  it('a successful sign-in starts the session', async () => {
    mockFetch(201, { accessToken: 'a', refreshToken: 'r' });
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'alex@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'right-password');
    await fireEvent.press(screen.getByText('Sign in'));
    await waitFor(() => expect(getSessionState().status).toBe('signedIn'));
    expect(calls[0].url).toBe('https://api.test/api/v1/auth/login');
  });

  it('after verifying in the browser: the verified banner and the email filled in', async () => {
    mockParams = { verified: '1', email: 'alex@example.com' };
    await render(<LoginScreen />);
    expect(screen.getByText('Your email is verified. Sign in to continue.')).toBeTruthy();
    expect(screen.getByLabelText('Email').props.value).toBe('alex@example.com');
  });

  it('an unverified email goes to the check-email screen, keeping the sign-in for later', async () => {
    mockFetch(403, { statusCode: 403, code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email to sign in.' });
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'alex@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'long-enough-1');
    await fireEvent.press(screen.getByText('Sign in'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/check-email',
        params: { email: 'alex@example.com', reason: 'signin' },
      }),
    );
    expect(pendingSignupFor('alex@example.com')?.password).toBe('long-enough-1');
    expect(getSessionState().status).not.toBe('signedIn');
  });

  it('the demo failing for the rate limit shows the web copy', async () => {
    mockFetch(429, { message: 'Too Many Requests' });
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByText('Try the demo'));
    expect(
      await screen.findByText("You've started a few demos already. Please try again in an hour, or create an account."),
    ).toBeTruthy();
    expect(calls[0].url).toBe('https://api.test/api/v1/auth/demo');
  });

  it('the demo starts a session', async () => {
    mockFetch(200, { accessToken: 'a', refreshToken: 'r', expiresAt: '2026-11-04T00:00:00.000Z', reused: false });
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByText('Try the demo'));
    await waitFor(() => expect(getSessionState().status).toBe('signedIn'));
  });

  it('Google is disabled with a reason where the native module is missing', async () => {
    await render(<LoginScreen />);
    expect(screen.getByText(/Google sign-in needs the MoFin app build/)).toBeTruthy();
  });
});

describe('register', () => {
  it('shows the web validation messages', async () => {
    mockFetch(500);
    await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'nope');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'short');
    await fireEvent.press(screen.getByText('Create account'));
    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy();
    // The hint is replaced by the error once the password is invalid.
    await waitFor(() => expect(screen.getAllByText('Use at least 8 characters.')).toHaveLength(1));
    expect(screen.getByText('Too short')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('maps a 400 field error from the backend onto the field', async () => {
    mockFetch(400, { message: 'Validation failed', errors: [{ path: 'email', message: 'Use your own email address' }] });
    await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'x@demo.mofin.app');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'long-enough-1');
    await fireEvent.press(screen.getByText('Create account'));
    expect(await screen.findByText('Use your own email address')).toBeTruthy();
  });

  it('on success waits for the emailed link, without signing in', async () => {
    mockFetch(201, { message: 'Check your email: we sent a link to finish creating your account.' });
    await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'alex@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'long-enough-1');
    await fireEvent.press(screen.getByText('Create account'));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/check-email',
        params: { email: 'alex@example.com', reason: 'signup' },
      }),
    );
    expect(calls[0].body).toEqual({ email: 'alex@example.com', password: 'long-enough-1', client: 'mobile' });
    expect(pendingSignupFor('alex@example.com')).not.toBeNull();
    expect(getSessionState().status).toBe('restoring');
  });
});

describe('forgot password', () => {
  it('validates, then shows the same confirmation whatever the backend knows', async () => {
    mockFetch(202, { message: 'If an account exists…' });
    await render(<ForgotPasswordScreen />);
    await fireEvent.press(screen.getByText('Send reset link'));
    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Email'), 'alex@example.com');
    await fireEvent.press(screen.getByText('Send reset link'));
    expect(await screen.findByText('Check your email')).toBeTruthy();
    expect(screen.getByText('alex@example.com')).toBeTruthy();
    expect(calls[0]).toEqual({ url: 'https://api.test/api/v1/auth/password/forgot', body: { email: 'alex@example.com' } });
  });

  it('a 429 shows the forgot-password rate-limit copy', async () => {
    mockFetch(429, {});
    await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'alex@example.com');
    await fireEvent.press(screen.getByText('Send reset link'));
    expect(await screen.findByText('Too many attempts. Please wait a few minutes and try again.')).toBeTruthy();
  });
});
