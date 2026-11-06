import { AccountMemberRole } from '@prisma/client';
import { z } from 'zod';
import { isDemoEmail } from '../../../common/utils/demo-identity';

const roleField = z.nativeEnum(AccountMemberRole);

// Normalized like every stored address, so an invitation matches whatever case the owner typed.
export const createInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .refine((email) => !isDemoEmail(email), {
      message: 'Use a real email address',
    }),
  role: roleField,
});
export type CreateInvitationDto = z.infer<typeof createInvitationSchema>;

// 43 chars for 32 bytes; the cap only stops an arbitrarily large string being hashed.
export const invitationTokenSchema = z.object({
  token: z.string().min(1).max(256),
});
export type InvitationTokenDto = z.infer<typeof invitationTokenSchema>;

export const updateMemberSchema = z.object({ role: roleField });
export type UpdateMemberDto = z.infer<typeof updateMemberSchema>;

export const accountPreferencesSchema = z.object({ hideAmount: z.boolean() });
export type AccountPreferencesDto = z.infer<typeof accountPreferencesSchema>;

export const transferOwnershipSchema = z.object({
  newOwnerId: z.string().min(1),
});
export type TransferOwnershipDto = z.infer<typeof transferOwnershipSchema>;
