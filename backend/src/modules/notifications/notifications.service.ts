import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DraftSource } from '@prisma/client';
import {
  DomainEvents,
  DraftCreatedEvent,
  RecurringOccurrencePostedEvent,
} from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';
import { AccountAccessService } from '../account-access/account-access.service';
import {
  RegisterDeviceDto,
  UpdateNotificationPreferencesDto,
} from './dto/notifications.dto';
import { PushMessage, PushSender } from './push-sender';

/** A burst of drafts from one assistant reply becomes a single notification. */
export const DRAFT_PUSH_WINDOW_MS = 3000;

interface PendingDrafts {
  count: number;
  client: string | null;
  timer: NodeJS.Timeout;
}

type PushTopic = 'notifyMcpDrafts' | 'notifyRecurring';

@Injectable()
export class NotificationsService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly pendingDrafts = new Map<string, PendingDrafts>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccountAccessService,
    private readonly sender: PushSender,
  ) {}

  onModuleDestroy() {
    for (const pending of this.pendingDrafts.values())
      clearTimeout(pending.timer);
    this.pendingDrafts.clear();
  }

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    await this.prisma.pushDevice.upsert({
      where: { expoToken: dto.expoToken },
      create: { userId, expoToken: dto.expoToken, platform: dto.platform },
      update: { userId, platform: dto.platform, lastSeenAt: new Date() },
    });
  }

  async removeDevice(userId: string, expoToken: string) {
    await this.prisma.pushDevice.deleteMany({ where: { userId, expoToken } });
  }

  getPreferences(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { notifyMcpDrafts: true, notifyRecurring: true },
    });
  }

  updatePreferences(userId: string, dto: UpdateNotificationPreferencesDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: { notifyMcpDrafts: true, notifyRecurring: true },
    });
  }

  @OnEvent(DomainEvents.DraftCreated)
  onDraftCreated(event: DraftCreatedEvent) {
    if (event.source !== DraftSource.MCP) return;
    const pending = this.pendingDrafts.get(event.userId);
    if (pending) {
      pending.count += 1;
      return;
    }
    const timer = setTimeout(
      () => void this.flushDrafts(event.userId),
      DRAFT_PUSH_WINDOW_MS,
    );
    timer.unref();
    this.pendingDrafts.set(event.userId, {
      count: 1,
      client: event.sourceClient?.trim() || null,
      timer,
    });
  }

  @OnEvent(DomainEvents.RecurringOccurrencePosted)
  async onRecurringPosted(event: RecurringOccurrencePostedEvent) {
    try {
      const userIds = await this.access.usersWithAccess(event.accountIds);
      // No amount, description or account name: a lock screen is not private.
      await this.pushToUsers(userIds, 'notifyRecurring', {
        title: 'Recurring transaction posted',
        body: 'A recurring transaction was added to your account.',
        data: { url: `/transactions/${event.transactionId}` },
      });
    } catch (error) {
      this.logger.warn(`Recurring push failed: ${(error as Error).message}`);
    }
  }

  private async flushDrafts(userId: string) {
    const pending = this.pendingDrafts.get(userId);
    this.pendingDrafts.delete(userId);
    if (!pending) return;
    try {
      const who = pending.client ?? 'A connected app';
      await this.pushToUsers([userId], 'notifyMcpDrafts', {
        title:
          pending.count === 1 ? 'New draft to review' : 'New drafts to review',
        body:
          pending.count === 1
            ? `${who} added a draft transaction.`
            : `${who} added ${pending.count} draft transactions.`,
        data: { url: '/drafts' },
      });
    } catch (error) {
      this.logger.warn(`Draft push failed: ${(error as Error).message}`);
    }
  }

  private async pushToUsers(
    userIds: string[],
    topic: PushTopic,
    content: Omit<PushMessage, 'to'>,
  ) {
    if (!userIds.length) return;
    const devices = await this.prisma.pushDevice.findMany({
      where: {
        userId: { in: userIds },
        user: { isDemo: false, [topic]: true },
      },
      select: { expoToken: true },
    });
    if (!devices.length) return;
    const gone = await this.sender.send(
      devices.map((device) => ({ ...content, to: device.expoToken })),
    );
    if (gone.length) {
      await this.prisma.pushDevice.deleteMany({
        where: { expoToken: { in: gone } },
      });
    }
  }
}
