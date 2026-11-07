import { z } from 'zod';

const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[^\]\s]+\]$/;

export const registerDeviceSchema = z.object({
  expoToken: z.string().regex(EXPO_PUSH_TOKEN, 'Not an Expo push token'),
  platform: z.enum(['ios', 'android']),
});
export type RegisterDeviceDto = z.infer<typeof registerDeviceSchema>;

export const updateNotificationPreferencesSchema = z
  .object({
    notifyMcpDrafts: z.boolean(),
    notifyRecurring: z.boolean(),
  })
  .partial();
export type UpdateNotificationPreferencesDto = z.infer<
  typeof updateNotificationPreferencesSchema
>;
