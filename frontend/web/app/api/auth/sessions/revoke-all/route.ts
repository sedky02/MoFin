import { postAsSession } from "@/lib/session-post";
import { clearAuthCookies } from "@/lib/auth-cookies";

export async function POST(req: Request) {
  const { res, ok } = await postAsSession(req, "auth/sessions/revoke-all", () => ({}));
  // Every refresh token of the account is revoked now, this browser's too, so
  // drop its cookies; the page then sends the user to /login.
  if (ok) clearAuthCookies(res);
  return res;
}
