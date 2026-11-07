import { HttpException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RecurringStatus } from '@prisma/client';
import {
  DomainEvents,
  RecurringOccurrencePostedEvent,
} from '../../common/events/domain-events';
import { withAdvisoryLock } from '../../common/utils/advisory-lock';
import { PrismaService } from '../../database/prisma.service';
import { computeNextOccurrence, isPastEndDate } from './recurrence';
import { RecurringSeriesService } from './recurring-series.service';
import { TransactionsService } from './transactions.service';

/** Arbitrary but stable key of the run's advisory lock (see withAdvisoryLock). */
const ADVISORY_LOCK_KEY = 727_002_001;

/**
 * Daily, one occurrence per series at a time, so an outage catches up gradually. A series that
 * can't post for a lasting reason is PAUSED with that reason.
 */
@Injectable()
export class RecurringTransactionsCron {
  private readonly logger = new Logger(RecurringTransactionsCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionsService: TransactionsService,
    private readonly seriesService: RecurringSeriesService,
    private readonly events: EventEmitter2,
  ) {}

  // UTC, like the occurrence dates the cron compares against.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'UTC' })
  async generateDueOccurrences() {
    const ran = await withAdvisoryLock(this.prisma, ADVISORY_LOCK_KEY, () =>
      this.generate(),
    );
    if (!ran) {
      this.logger.log(
        'Another instance holds the recurring-transactions lock; skipping this run.',
      );
    }
  }

  private async generate() {
    const now = new Date();
    const dueRoots = await this.prisma.transaction.findMany({
      // A deleted root is a stopped series (restoring it picks the series up again).
      where: {
        isRecurring: true,
        recurringStatus: RecurringStatus.ACTIVE,
        deletedAt: null,
        nextOccurrenceAt: { lte: now },
      },
    });

    for (const root of dueRoots) {
      try {
        // A series whose cursor is already past its end date ends here without posting anything.
        if (isPastEndDate(root.nextOccurrenceAt!, root.recurringEndDate)) {
          await this.prisma.transaction.update({
            where: { id: root.id },
            data: {
              recurringStatus: RecurringStatus.CANCELLED,
              nextOccurrenceAt: null,
            },
          });
          continue;
        }

        const problem = await this.seriesService.findSeriesProblem(root);
        if (problem) {
          await this.pause(root.id, problem);
          continue;
        }

        // Occurrence and cursor advance commit atomically; the unique (parentTransactionId,
        // occurredAt) constraint rejects a duplicate if a retry meets a half-applied row.
        const created = await this.prisma.$transaction(async (db) => {
          const occurrence = await this.transactionsService.create(
            root.userId,
            {
              type: root.type,
              description: root.description,
              amount: root.recurringAmount!.toString(),
              currency: root.currency,
              occurredAt: root.nextOccurrenceAt!,
              fromAccountId: root.recurringFromAccountId ?? undefined,
              toAccountId: root.recurringToAccountId ?? undefined,
              categoryId: root.categoryId ?? undefined,
              parentTransactionId: root.id,
              createdById: root.createdById,
            },
            db,
          );

          const next = computeNextOccurrence(
            root.occurredAt.getUTCDate(),
            root.nextOccurrenceAt!,
            root.recurringInterval!,
          );
          const ended = isPastEndDate(next, root.recurringEndDate);

          await db.transaction.update({
            where: { id: root.id },
            data: ended
              ? {
                  recurringStatus: RecurringStatus.CANCELLED,
                  nextOccurrenceAt: null,
                }
              : { nextOccurrenceAt: next },
          });

          return occurrence;
        });

        this.transactionsService.announceCreated(created);
        this.events.emit(DomainEvents.RecurringOccurrencePosted, {
          transactionId: created.id,
          parentTransactionId: root.id,
          accountIds: [...new Set(created.items.map((i) => i.accountId))],
        } satisfies RecurringOccurrencePostedEvent);
      } catch (error) {
        // A 4xx from create() means the template is invalid in a way findSeriesProblem doesn't know
        // yet, and would fail the same way tomorrow.
        if (error instanceof HttpException && error.getStatus() < 500) {
          await this.pause(root.id, error.message).catch((pauseError: Error) =>
            this.logger.error(
              `Failed to pause recurring series ${root.id}`,
              pauseError,
            ),
          );
        } else {
          this.logger.error(
            `Failed to generate recurring occurrence for transaction ${root.id}`,
            error as Error,
          );
        }
      }
    }
  }

  /** Only an ACTIVE series is paused, so a cancel that landed during the run wins. */
  private async pause(rootId: string, reason: string): Promise<void> {
    await this.prisma.transaction.updateMany({
      where: { id: rootId, recurringStatus: RecurringStatus.ACTIVE },
      data: {
        recurringStatus: RecurringStatus.PAUSED,
        recurringError: reason,
        lastFailedAt: new Date(),
      },
    });
    // The reason can name the user's accounts, so the log keeps to the id.
    this.logger.warn(
      `Paused recurring series ${rootId} that can no longer post`,
    );
  }
}
