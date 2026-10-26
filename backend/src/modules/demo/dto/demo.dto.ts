import { z } from 'zod';

/**
 * POST /auth/demo. The BFF sends the visitor's current refresh token, if any,
 * so a visitor already in a demo carries on with it instead of getting a new one.
 */
export const startDemoSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type StartDemoDto = z.infer<typeof startDemoSchema>;
