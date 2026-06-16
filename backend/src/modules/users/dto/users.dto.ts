import { z } from 'zod';

export const updateProfileSchema = z.object({
  displayName: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

export interface CreateUserInput {
  email: string;
  passwordHash?: string;
  displayName?: string;
  googleId?: string;
}
