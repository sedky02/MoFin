import { NextRequest, NextResponse } from "next/server";
import { SIGNUP_BINDING_COOKIE } from "@/lib/auth-cookies";
import { postToBackend } from "@/lib/bff-auth-post";

/** A new verification link, still tied to this browser when it is the one that signed up. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.email) {
    return NextResponse.json({ statusCode: 400, message: "Email is required." }, { status: 400 });
  }

  const browserBinding = req.cookies.get(SIGNUP_BINDING_COOKIE)?.value;
  const result = await postToBackend(req, "/auth/email/verification/resend", {
    email: body.email,
    ...(browserBinding ? { browserBinding } : {}),
    client: "web",
  });
  if (!result.ok) return result.response;
  return NextResponse.json(result.data, { status: result.status });
}
