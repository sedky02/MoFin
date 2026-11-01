import { NextResponse } from "next/server";
import { postAsSession } from "@/lib/session-post";
import { clearAuthCookies } from "@/lib/auth-cookies";

/**
 * Deletes the signed-in account and all of its data. Needs the typed word
 * (`confirm: "DELETE"`, which the backend checks again); on success the
 * account's sessions no longer exist, so this browser's cookies go too.
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
