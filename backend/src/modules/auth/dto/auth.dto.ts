import { z } from 'zod';
import { isDemoEmail } from '../../../common/utils/demo-identity';

// Emails are normalized (trimmed + lowercased) so register and login always
// agree — the email column is case-sensitive-unique, so without this a user who
// registers `Foo@x.com` cannot log in as `foo@x.com`, and duplicate accounts can
// be created for the same address in different cases.
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

// Same password rule as registration. The token is the base64url value from
// the emailed link (43 chars for 32 bytes); the upper bound just stops an
// arbitrarily large string from being hashed.
export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(256),
  password: newPasswordField,
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

// `refreshToken` is the caller's own session token, which the web BFF reads
// from its cookie and forwards so that session survives the change. Without
// it every session of the account is signed out, the caller's included.
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
