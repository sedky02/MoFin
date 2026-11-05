import { Injectable, NotFoundException } from '@nestjs/common';
import { AiChat, AiChatMessage, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
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
}

export function toSummaryView(chat: AiChat): AiChatSummaryView {
  return {
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  };
}

export function toMessageView(message: AiChatMessage): AiChatMessageView {
  return {
    id: message.id,
    role: message.role === 'USER' ? 'user' : 'assistant',
    content: message.content,
    usedTools: message.usedTools,
    charts: (message.charts as AiChart[] | null) ?? [],
    createdAt: message.createdAt.toISOString(),
  };
}

const notFound = () => new NotFoundException('Chat not found');

/**
 * Storage for saved assistant chats. Every query is scoped to `userId`, so a
 * chat id from another user reads as not found. Nothing here talks to the
 * model; AiChatService does that and saves a turn only once it has a reply,
 * so a failed answer leaves no half-written chat behind.
 */
@Injectable()
export class AiChatsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return {
      ...toSummaryView(chat),
      messages: chat.messages.map(toMessageView),
    };
  }

  /** The chat and its messages, oldest first, for building the model's context. */
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
   * Saves one question and its answer together, creating the chat when
   * `chatId` is null. The two timestamps are explicit so the order holds even
   * when both land in the same millisecond.
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
