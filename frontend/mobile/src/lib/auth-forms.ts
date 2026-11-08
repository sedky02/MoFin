// Validation and copy for the sign-in screens, mirrored from the web. Emails are trimmed first,
// since phone keyboards and autofill often leave a trailing space (the backend trims too).
import { z } from 'zod';

import { ApiClientError } from '@/api/http';
import { MIN_PASSWORD_LENGTH } from '@/core/password-strength';

const email = z.string().trim().email('Enter a valid email address.');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required.'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email,
  password: z.string().min(MIN_PASSWORD_LENGTH, 'Use at least 8 characters.'),
  displayName: z.string().trim().max(80).optional(),
});
export type RegisterValues = z.infer<typeof registerSchema>;

export const forgotSchema = z.object({ email });
export type ForgotValues = z.infer<typeof forgotSchema>;

export const AUTH_COPY = {
  incorrect: 'Incorrect email or password.',
  rateLimited: 'Too many attempts. Please wait a moment and try again.',
  rateLimitedForgot: 'Too many attempts. Please wait a few minutes and try again.',
  verified: 'Your email is verified. Sign in to continue.',
  expired: 'Your session expired. Sign in to continue.',
  loginFailed: 'Login failed.',
  registerFailed: 'Registration failed.',
  forgotFailed: 'Could not send the reset link.',
} as const;

export const STRENGTH = [
  { label: 'Too short', cls: 'bg-destructive' },
  { label: 'Weak', cls: 'bg-destructive' },
  { label: 'Fair', cls: 'bg-warning' },
  { label: 'Good', cls: 'bg-primary' },
  { label: 'Strong', cls: 'bg-success' },
] as const;

export type DemoNotice = 'busy' | 'limited' | 'off' | 'failed';

export const DEMO_NOTICES: Record<DemoNotice, string> = {
  busy: 'The demo is busy right now. Please try again in a few minutes.',
  limited: "You've started a few demos already. Please try again in an hour, or create an account.",
  off: "The demo isn't available right now. You can still create an account.",
  failed: "We couldn't start the demo. Please try again.",
};

/** Why POST /auth/demo didn't start a demo (same mapping as the web's /api/demo route). */
export function demoNoticeFor(error: unknown): DemoNotice {
  if (!(error instanceof ApiClientError)) return 'failed';
  if (error.status === 429) return 'limited';
  if (error.status === 503) {
    const code = (error.body as { code?: string } | undefined)?.code;
    return code === 'DEMO_DISABLED' ? 'off' : 'busy';
  }
  return 'failed';
}
