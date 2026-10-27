import { z } from 'zod';

export const updateProfileSchema = z.object({
  displayName: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

// Proof that the caller means to delete the account: the current password,
// or, for an account that only signs in with Google (no password), the
// account's email typed out. The service decides which one applies.
export const deleteAccountSchema = z.object({
  password: z.string().max(1024).optional(),
  confirmEmail: z.string().max(320).optional(),
});
export type DeleteAccountDto = z.infer<typeof deleteAccountSchema>;

export interface CreateUserInput {
  email: string;
  passwordHash?: string;
  displayName?: string;
  googleId?: string;
  /** Temporary "Try the demo" user (see DemoService). */
  isDemo?: boolean;
  expiresAt?: Date;
}
