import { NextResponse } from "next/server";
import { postAsSession } from "@/lib/session-post";
import { clearAuthCookies } from "@/lib/auth-cookies";

/**
 * Deletes the signed-in account and all of its data. The backend checks the
 * password (or, for a Google-only account, the typed email); on success the
 * account's sessions no longer exist, so this browser's cookies go too.
 */
export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : undefined;
  const confirmEmail = typeof body?.confirmEmail === "string" ? body.confirmEmail : undefined;
  if (password === undefined && confirmEmail === undefined) {
    return NextResponse.json(
      { statusCode: 400, message: "Confirm with your password or email." },
      { status: 400 },
    );
  }

  const { res, ok } = await postAsSession(req, "users/me", () => ({ password, confirmEmail }), "DELETE");
  if (ok) clearAuthCookies(res);
  return res;
}
