import { z } from 'zod';
import { isDemoEmail } from '../../../common/utils/demo-identity';

// Normalized so register and login agree: the email column is case-sensitive-unique, so `Foo@x.com`
// would otherwise not log in as `foo@x.com`.
const emailField = z.string().trim().toLowerCase().email();

// The one rule every new password follows: register, reset and change.
const newPasswordField = z.string().min(8);

export const registerSchema = z.object({
  // Demo users are recognised by this domain alone, so nobody may register on it.
  email: emailField.refine((email) => !isDemoEmail(email), {
    message: 'Use your own email address',
  }),
  password: newPasswordField,
  displayName: z.string().optional(),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailField,
  password: z.string(),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});
export type LogoutDto = z.infer<typeof logoutSchema>;

export const forgotPasswordSchema = z.object({
  email: emailField,
});
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

// The base64url token from the emailed link; the cap only stops an arbitrarily large string being
// hashed.
export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(256),
  password: newPasswordField,
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1).max(256),
});
export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;

// `refreshToken` is the caller's own session, forwarded by the BFF so it survives the change;
// without it every session is signed out, the caller's included.
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: newPasswordField,
  refreshToken: z.string().min(1).optional(),
});
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

// Exchanged server-to-server by the web BFF Google callback: the one-time
// authorization code from Google plus the exact redirect_uri used to obtain it.
export const googleLoginSchema = z.object({
  code: z.string().min(1),
  redirectUri: z.string().url(),
});
export type GoogleLoginDto = z.infer<typeof googleLoginSchema>;

// The ID token Google gave the device; untrusted until GoogleIdTokenVerifier checks it. Strict, so
// any extra field is a 400 instead of silently dropped.
export const googleIdTokenSchema = z
  .object({
    idToken: z.string().min(1).max(8192),
  })
  .strict();
export type GoogleIdTokenDto = z.infer<typeof googleIdTokenSchema>;
