import { z } from 'zod';
import { currencySchema } from '../../../common/dto/common-fields';

export const parseTransactionIntentSchema = z.object({
  input: z.string().min(1).max(1000),
  defaultAccountId: z.string().optional(),
  defaultCurrency: currencySchema.optional(),
});
export type ParseTransactionIntentDto = z.infer<
  typeof parseTransactionIntentSchema
>;

export const MAX_CHAT_MESSAGES = 20;
export const MAX_CHAT_MESSAGE_CHARS = 2000;

/** The client keeps the conversation and sends it whole; nothing is stored. */
export const aiChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(MAX_CHAT_MESSAGE_CHARS),
      }),
    )
    .min(1)
    .max(MAX_CHAT_MESSAGES)
    .refine((messages) => messages[messages.length - 1].role === 'user', {
      message: 'The last message must come from the user',
    }),
});
export type AiChatDto = z.infer<typeof aiChatSchema>;

export interface AiChatReply {
  message: string;
  /** Tools the assistant looked at to answer, in call order, without repeats. */
  usedTools: string[];
}
