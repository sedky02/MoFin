// The credentials of a sign-up waiting for its email to be verified, so the app can sign itself in
// once the link has been opened. Kept in memory only: never written to the device.
export interface PendingSignup {
  email: string;
  password: string;
}

let pending: PendingSignup | null = null;

export function rememberPendingSignup(signup: PendingSignup): void {
  pending = signup;
}

export function pendingSignupFor(email: string | undefined): PendingSignup | null {
  if (!pending || !email) return null;
  return pending.email.toLowerCase() === email.trim().toLowerCase() ? pending : null;
}

export function forgetPendingSignup(): void {
  pending = null;
}
