import { z } from 'zod';

export const updateProfileSchema = z.object({
  displayName: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

// Both destructive routes need the word typed, so a stray or replayed request deletes nothing. No
// password: a Google-only account has none.
export const confirmDeleteSchema = z.object({ confirm: z.literal('DELETE') });
export type ConfirmDeleteDto = z.infer<typeof confirmDeleteSchema>;

export interface CreateUserInput {
  email: string;
  passwordHash?: string;
  displayName?: string;
  googleId?: string;
  /** Set when the address is already proven, as with Google sign-in. */
  emailVerifiedAt?: Date;
  isDemo?: boolean;
  expiresAt?: Date;
}
