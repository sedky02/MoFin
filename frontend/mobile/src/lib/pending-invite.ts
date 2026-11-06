// The invitation link the app was opened with, kept in memory while the person signs in: the route
// guard sends a signed-out user to the sign-in screen, and a URL param wouldn't survive that. A
// token is only useful with a sign-in on the invited address, and it goes when the app closes.
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
