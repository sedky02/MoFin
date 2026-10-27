/**
 * Name of the non-secret "this browser has a session" cookie. Shared by the
 * server cookie helpers (lib/auth-cookies.ts, which sets and clears it with the
 * session) and client code that can't read the httpOnly session cookies.
 */
export const SIGNED_IN_COOKIE = "mofin_signed_in";
