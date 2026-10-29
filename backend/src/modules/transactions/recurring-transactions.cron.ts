import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RecurringStatus } from '@prisma/client';
import { withAdvisoryLock } from '../../common/utils/advisory-lock';
import { PrismaService } from '../../database/prisma.service';
import { computeNextOccurrence, isPastEndDate } from './recurrence';
import { RecurringSeriesService } from './recurring-series.service';
import { TransactionsService } from './transactions.service';

/** Arbitrary but stable key of the run's advisory lock (see withAdvisoryLock). */
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
    private readonly seriesService: RecurringSeriesService,
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
        // A series whose cursor is already past its end date (e.g. one
        // created or edited before create/updateRecurring ended it on the
        // spot) ends here without posting anything.
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

        const problem = await this.seriesService.findSeriesProblem(
          root.userId,
          root,
        );
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
              parentTransactionId: root.id,
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
      } catch (error) {
        // create() rejecting the occurrence (a 4xx) means the template itself
        // is invalid in a way findSeriesProblem doesn't know about yet, and
        // it would fail the same way tomorrow.
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

  /**
   * Holds a series that can't post, keeping the reason for the user. Only an
   * ACTIVE series is paused, so a cancel that landed during the run wins.
   */
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
