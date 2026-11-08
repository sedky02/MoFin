import { NextRequest, NextResponse } from "next/server";
import {
  SIGNUP_BINDING_COOKIE,
  clearSignupBindingCookie,
  setAuthCookies,
  type BackendTokens,
} from "@/lib/auth-cookies";
import { postToBackend } from "@/lib/bff-auth-post";

/**
 * Redeems a verification link. The backend returns a session only when this browser holds the
 * binding cookie set at sign-up; tokens go into httpOnly cookies, never the body.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.token) {
    return NextResponse.json({ statusCode: 400, message: "Token is required." }, { status: 400 });
  }

  const browserBinding = req.cookies.get(SIGNUP_BINDING_COOKIE)?.value;
  const result = await postToBackend(req, "/auth/email/verify", {
    token: body.token,
    ...(browserBinding ? { browserBinding } : {}),
  });
  if (!result.ok) return result.response;

  const { accessToken, refreshToken, email, alreadyVerified } = result.data;
  const signedIn = typeof accessToken === "string" && typeof refreshToken === "string";
  const res = NextResponse.json({ email, signedIn, alreadyVerified: alreadyVerified === true });
  if (signedIn) {
    setAuthCookies(res, { accessToken, refreshToken } as BackendTokens);
    clearSignupBindingCookie(res);
  }
  return res;
}
