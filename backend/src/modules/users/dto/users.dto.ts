import { z } from 'zod';

export const updateProfileSchema = z.object({
  displayName: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

// The two destructive routes (delete the account, delete its data) both need the
// word typed out, so a bare request (a stray client, a replayed URL) deletes
// nothing. No password: a Google-only account has none to ask for.
export const confirmDeleteSchema = z.object({ confirm: z.literal('DELETE') });
export type ConfirmDeleteDto = z.infer<typeof confirmDeleteSchema>;

export interface CreateUserInput {
  email: string;
  passwordHash?: string;
  displayName?: string;
  googleId?: string;
  /** Temporary "Try the demo" user (see DemoService). */
  isDemo?: boolean;
  expiresAt?: Date;
}
