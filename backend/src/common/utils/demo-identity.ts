/**
 * `.invalid` is reserved (RFC 2606) and never receives mail, and registration refuses it, so a demo
 * user is recognised from the token's email alone, with no database read.
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
