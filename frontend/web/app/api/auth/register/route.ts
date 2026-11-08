import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { setSignupBindingCookie } from "@/lib/auth-cookies";
import { postToBackend } from "@/lib/bff-auth-post";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json(
      { statusCode: 400, message: "Email and password are required." },
      { status: 400 },
    );
  }

  // Only this browser gets a session from the emailed link (the backend keeps a hash of this value).
  const browserBinding = randomBytes(32).toString("base64url");
  const result = await postToBackend(req, "/auth/register", {
    email: body.email,
    password: body.password,
    ...(body.displayName ? { displayName: body.displayName } : {}),
    browserBinding,
    client: "web",
  });
  if (!result.ok) return result.response;

  // No session here: the backend answers the same whether or not the email was new.
  const res = NextResponse.json(result.data);
  setSignupBindingCookie(res, browserBinding);
  return res;
}
