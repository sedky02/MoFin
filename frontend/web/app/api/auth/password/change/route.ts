import { NextResponse } from "next/server";
import { postAsSession } from "@/lib/session-post";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (typeof body?.currentPassword !== "string" || typeof body?.newPassword !== "string") {
    return NextResponse.json(
      { statusCode: 400, message: "Current and new password are required." },
      { status: 400 },
    );
  }

  // The backend keeps the session whose refresh token it is given and signs
  // out every other one, so this browser stays signed in.
  const { res } = await postAsSession(req, "auth/password/change", (refreshToken) => ({
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
    ...(refreshToken ? { refreshToken } : {}),
  }));
  return res;
}
