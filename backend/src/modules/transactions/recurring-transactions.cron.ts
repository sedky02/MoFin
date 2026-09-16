import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RecurringStatus } from '@prisma/client';
import { DomainEvents, TransactionCreatedEvent } from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';
import { computeNextOccurrence, TransactionsService } from './transactions.service';

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
        where: { isRecurring: true, recurringStatus: RecurringStatus.ACTIVE, nextOccurrenceAt: { lte: now } }
      });

      for (const root of dueRoots) {
        try {
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
            const ended = root.recurringEndDate ? next > root.recurringEndDate : false;

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
          this.logger.error(`Failed to generate recurring occurrence for transaction ${root.id}`, error as Error);
        }
      }
    } finally {
      await this.releaseLock();
    }
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
