// The invitation link the app opened with, kept in memory while signing in (the guard's redirect
// would lose a URL param). A token does nothing without the invited address's sign-in.
let pending: string | undefined;

export function rememberInvite(token: string): void {
  pending = token;
}

export function pendingInvite(): string | undefined {
  return pending;
}

export function forgetInvite(): void {
  pending = undefined;
}
