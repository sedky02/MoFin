import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AiChat,
  AiChatMessage,
  DraftTransaction,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { DraftTransactionsService } from '../../draft-transactions/draft-transactions.service';
import {
  AiChatDetailView,
  AiChatMessageView,
  AiChatSummaryView,
  ListChatsQueryDto,
} from '../dto/ai.dto';
import { AiChart } from './chart-tools';

export interface ReplyToSave {
  content: string;
  usedTools: string[];
  charts: AiChart[];
  /** Drafts the answer created; kept as ids and read back fresh. */
  draftIds: string[];
}

export type DraftsById = ReadonlyMap<string, DraftTransaction>;

export function toSummaryView(chat: AiChat): AiChatSummaryView {
  return {
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  };
}

/**
 * Drafts come from `drafts` (read fresh), so a draft approved in the inbox shows as approved here;
 * one that no longer exists is left out.
 */
export function toMessageView(
  message: AiChatMessage,
  drafts: DraftsById = new Map(),
): AiChatMessageView {
  return {
    id: message.id,
    role: message.role === 'USER' ? 'user' : 'assistant',
    content: message.content,
    usedTools: message.usedTools,
    charts: (message.charts as AiChart[] | null) ?? [],
    drafts: message.draftIds.flatMap((id) => {
      const draft = drafts.get(id);
      return draft ? [draft] : [];
    }),
    createdAt: message.createdAt.toISOString(),
  };
}

const notFound = () => new NotFoundException('Chat not found');

/**
 * Every query is scoped to `userId`, so another user's chat id reads as not found. A turn is saved
 * only once there is a reply, so a failed answer leaves no half-written chat.
 */
@Injectable()
export class AiChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly draftsService: DraftTransactionsService,
  ) {}

  async draftsFor(
    userId: string,
    messages: Pick<AiChatMessage, 'draftIds'>[],
  ): Promise<DraftsById> {
    const ids = [...new Set(messages.flatMap((m) => m.draftIds))];
    const drafts = await this.draftsService.findByIds(userId, ids);
    return new Map(drafts.map((d) => [d.id, d]));
  }

  async list(userId: string, query: ListChatsQueryDto) {
    const page = await this.prisma.paginated.aiChat.paginate({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      limit: query.limit,
      offset: query.offset,
    });
    return { ...page, data: page.data.map(toSummaryView) };
  }

  async get(userId: string, chatId: string): Promise<AiChatDetailView> {
    const chat = await this.prisma.aiChat.findFirst({
      where: { id: chatId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!chat) throw notFound();
    const drafts = await this.draftsFor(userId, chat.messages);
    return {
      ...toSummaryView(chat),
      messages: chat.messages.map((m) => toMessageView(m, drafts)),
    };
  }

  async loadForReply(userId: string, chatId: string) {
    const chat = await this.prisma.aiChat.findFirst({
      where: { id: chatId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!chat) throw notFound();
    return chat;
  }

  async rename(userId: string, chatId: string, title: string) {
    const { count } = await this.prisma.aiChat.updateMany({
      where: { id: chatId, userId },
      data: { title },
    });
    if (!count) throw notFound();
    const chat = await this.prisma.aiChat.findUniqueOrThrow({
      where: { id: chatId },
    });
    return toSummaryView(chat);
  }

  /** Chats are conversations, not financial records: deleting one is final. */
  async remove(userId: string, chatId: string): Promise<void> {
    const { count } = await this.prisma.aiChat.deleteMany({
      where: { id: chatId, userId },
    });
    if (!count) throw notFound();
  }

  /**
   * Saves a question and its answer together, creating the chat when chatId is null. The timestamps
   * are explicit so the order holds within one millisecond.
   */
  async saveTurn(
    userId: string,
    chatId: string | null,
    title: string,
    question: { content: string; askedAt: Date },
    reply: ReplyToSave,
  ) {
    const answeredAt = new Date(
      Math.max(Date.now(), question.askedAt.getTime() + 1),
    );
    return this.prisma.$transaction(async (tx) => {
      const chat = chatId
        ? await tx.aiChat.update({
            where: { id: chatId },
            // Bumps updatedAt, which orders the chat list.
            data: { updatedAt: answeredAt },
          })
        : await tx.aiChat.create({ data: { userId, title } });
      const asked = await tx.aiChatMessage.create({
        data: {
          chatId: chat.id,
          role: 'USER',
          content: question.content,
          createdAt: question.askedAt,
        },
      });
      const answered = await tx.aiChatMessage.create({
        data: {
          chatId: chat.id,
          role: 'ASSISTANT',
          content: reply.content,
          usedTools: reply.usedTools,
          draftIds: reply.draftIds,
          charts: reply.charts.length
            ? (reply.charts as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          createdAt: answeredAt,
        },
      });
      return { chat, asked, answered };
    });
  }

  async saveSummary(chatId: string, summary: string, summarizedCount: number) {
    await this.prisma.aiChat.update({
      where: { id: chatId },
      data: { summary, summarizedCount },
    });
  }
}
