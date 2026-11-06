import { z } from 'zod';
import { currencySchema } from '../../../common/dto/common-fields';
import { paginationSchema } from '../../../common/dto/pagination';
import { timeZoneSchema } from '../../../common/utils/time-zone';
import type { DraftTransaction } from '@prisma/client';
import type { AiChart } from '../chat/chart-tools';

export const parseTransactionIntentSchema = z.object({
  input: z.string().trim().min(1).max(1000),
  defaultAccountId: z.string().optional(),
  defaultCurrency: currencySchema.optional(),
  /** The user's IANA zone, so "yesterday" means their yesterday. Defaults to UTC. */
  timeZone: timeZoneSchema.optional(),
});
export type ParseTransactionIntentDto = z.infer<
  typeof parseTransactionIntentSchema
>;

export const MAX_CHAT_MESSAGE_CHARS = 2000;

/** One new question. The server keeps the conversation; the client sends only this. */
export const sendChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_CHARS),
  /** The user's IANA zone: "this month" and "today" are read in it. Defaults to UTC. */
  timeZone: timeZoneSchema.optional(),
  /** How the question was given: spoken questions label their drafts as voice. */
  inputMode: z.enum(['text', 'voice']).default('text'),
});
export type SendChatMessageDto = z.infer<typeof sendChatMessageSchema>;

export const renameChatSchema = z.object({
  title: z.string().trim().min(1).max(80),
});
export type RenameChatDto = z.infer<typeof renameChatSchema>;

export const listChatsQuerySchema = paginationSchema;
export type ListChatsQueryDto = z.infer<typeof listChatsQuerySchema>;

export interface AiChatMessageView {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  usedTools: string[];
  charts: AiChart[];
  /**
   * Drafts this answer created, in their current state: one approved or
   * rejected in the inbox shows that status here too.
   */
  drafts: DraftTransaction[];
  createdAt: string;
}

export interface AiChatSummaryView {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatDetailView extends AiChatSummaryView {
  messages: AiChatMessageView[];
}

export interface AiChatTurnView {
  chat: AiChatSummaryView;
  messages: [AiChatMessageView, AiChatMessageView];
}
