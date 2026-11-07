import { z } from 'zod';
import { aiProviderSchema, modelIdSchema } from '../../llm/provider-presets';

export const saveAiCredentialSchema = z.object({
  // Keys are printable ASCII without spaces; anything else is a paste mistake.
  apiKey: z
    .string()
    .trim()
    .min(8)
    .max(300)
    .regex(/^[\x21-\x7e]+$/, 'An API key has no spaces or special characters'),
  model: modelIdSchema.optional(),
});
export type SaveAiCredentialDto = z.infer<typeof saveAiCredentialSchema>;

export const updateAiPreferencesSchema = z
  .object({
    activeProvider: aiProviderSchema.nullable(),
    fallbackEnabled: z.boolean(),
  })
  .partial();
export type UpdateAiPreferencesDto = z.infer<typeof updateAiPreferencesSchema>;
