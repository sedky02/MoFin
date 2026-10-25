import { HttpException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RecurringStatus } from '@prisma/client';
import { DomainEvents, TransactionCreatedEvent } from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';
import { computeNextOccurrence, isPastEndDate, TransactionsService } from './transactions.service';

/**
 * Fixed key for a Postgres session advisory lock, arbitrary but stable. Only
 * one process (across however many replicas) can hold it at a time, so
 * @nestjs/schedule firing this cron on every replica doesn't multiply every
 * recurring charge by the replica count.
 */
const ADVISORY_LOCK_KEY = 727_002_001;

/**
 * Generates the next Transaction(s) for each active recurring series. Runs
 * daily and catches up one occurrence at a time per series so an outage of
 * any length is caught up gradually rather than all at once, mirroring
 * GoalsService's rollover job.
 *
 * A series that can't post for a reason that won't fix itself (an archived
 * account, a currency mismatch...) is PAUSED with that reason instead of
 * failing every night; the user resumes it once it's fixed. Anything else
 * (the database going away mid-run) is logged and retried on the next run.
 */
@Injectable()
export class RecurringTransactionsCron {
  private readonly logger = new Logger(RecurringTransactionsCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionsService: TransactionsService,
    private readonly events: EventEmitter2
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateDueOccurrences() {
    const locked = await this.acquireLock();
    if (!locked) {
      this.logger.log('Another instance holds the recurring-transactions lock; skipping this run.');
      return;
    }

    try {
      const now = new Date();
      const dueRoots = await this.prisma.transaction.findMany({
        // A deleted root is a stopped series (restoring it picks the series up again).
        where: { isRecurring: true, recurringStatus: RecurringStatus.ACTIVE, deletedAt: null, nextOccurrenceAt: { lte: now } }
      });

      for (const root of dueRoots) {
        try {
          // A series whose cursor is already past its end date (e.g. one
          // created or edited before create/updateRecurring ended it on the
          // spot) ends here without posting anything.
          if (isPastEndDate(root.nextOccurrenceAt!, root.recurringEndDate)) {
            await this.prisma.transaction.update({
              where: { id: root.id },
              data: { recurringStatus: RecurringStatus.CANCELLED, nextOccurrenceAt: null }
            });
            continue;
          }

          const problem = await this.transactionsService.findSeriesProblem(root.userId, root);
          if (problem) {
            await this.pause(root.id, problem);
            continue;
          }

          // Occurrence creation and cursor advance commit atomically: a crash
          // between them is impossible, and the @@unique([parentTransactionId,
          // occurredAt]) constraint rejects a duplicate outright if this ever
          // retries against a row that was (pre-fix) left half-applied.
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
                parentTransactionId: root.id
              },
              db
            );

            const next = computeNextOccurrence(root.occurredAt.getUTCDate(), root.nextOccurrenceAt!, root.recurringInterval!);
            const ended = isPastEndDate(next, root.recurringEndDate);

            await db.transaction.update({
              where: { id: root.id },
              data: ended
                ? { recurringStatus: RecurringStatus.CANCELLED, nextOccurrenceAt: null }
                : { nextOccurrenceAt: next }
            });

            return occurrence;
          });

          this.events.emit(DomainEvents.TransactionCreated, {
            transactionId: created.id,
            userId: root.userId,
            occurredAt: created.occurredAt
          } satisfies TransactionCreatedEvent);
        } catch (error) {
          // create() rejecting the occurrence (a 4xx) means the template itself
          // is invalid in a way findSeriesProblem doesn't know about yet, and
          // it would fail the same way tomorrow.
          if (error instanceof HttpException && error.getStatus() < 500) {
            await this.pause(root.id, error.message).catch((pauseError: Error) =>
              this.logger.error(`Failed to pause recurring series ${root.id}`, pauseError)
            );
          } else {
            this.logger.error(`Failed to generate recurring occurrence for transaction ${root.id}`, error as Error);
          }
        }
      }
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Holds a series that can't post, keeping the reason for the user. Only an
   * ACTIVE series is paused, so a cancel that landed during the run wins.
   */
  private async pause(rootId: string, reason: string): Promise<void> {
    await this.prisma.transaction.updateMany({
      where: { id: rootId, recurringStatus: RecurringStatus.ACTIVE },
      data: { recurringStatus: RecurringStatus.PAUSED, recurringError: reason, lastFailedAt: new Date() }
    });
    // The reason can name the user's accounts, so the log keeps to the id.
    this.logger.warn(`Paused recurring series ${rootId} that can no longer post`);
  }

  private async acquireLock(): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked
    `;
    return rows[0]?.locked === true;
  }

  private async releaseLock(): Promise<void> {
    await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
  }
}
