import { z } from 'zod';

/**
 * The BFF sends the visitor's current refresh token, so a visitor already in a demo carries on with
 * it.
 */
export const startDemoSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type StartDemoDto = z.infer<typeof startDemoSchema>;
