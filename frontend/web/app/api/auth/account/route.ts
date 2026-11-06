import { NextResponse } from "next/server";
import { postAsSession } from "@/lib/session-post";
import { clearAuthCookies } from "@/lib/auth-cookies";

/**
 * Needs the typed word (the backend checks it again); the account's sessions are gone afterwards,
 * so this browser's cookies go too.
 */
export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  if (body?.confirm !== "DELETE") {
    return NextResponse.json({ statusCode: 400, message: "Type DELETE to confirm." }, { status: 400 });
  }

  const { res, ok } = await postAsSession(req, "users/me", () => ({ confirm: "DELETE" }), "DELETE");
  if (ok) clearAuthCookies(res);
  return res;
}
