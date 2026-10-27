/**
 * Temporary "Try the demo" users get an address on this domain. `.invalid` is
 * reserved (RFC 2606) and never receives mail, and registration refuses it, so
 * a request can be recognised as a demo user's from the email in its access
 * token alone, without a database read.
 */
export const DEMO_EMAIL_DOMAIN = 'demo.mofin.invalid';

export function demoEmail(id: string): string {
  return `demo-${id}@${DEMO_EMAIL_DOMAIN}`;
}

export function isDemoEmail(email: string | null | undefined): boolean {
  return (
    typeof email === 'string' &&
    email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`)
  );
}
