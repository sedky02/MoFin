import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RecurringStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { computeNextOccurrence, TransactionsService } from './transactions.service';

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
    private readonly transactionsService: TransactionsService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateDueOccurrences() {
    const now = new Date();
    const dueRoots = await this.prisma.transaction.findMany({
      where: { isRecurring: true, recurringStatus: RecurringStatus.ACTIVE, nextOccurrenceAt: { lte: now } }
    });

    for (const root of dueRoots) {
      try {
        await this.transactionsService.create(root.userId, {
          type: root.type,
          description: root.description,
          amount: root.recurringAmount!.toString(),
          currency: root.currency,
          occurredAt: root.nextOccurrenceAt!,
          fromAccountId: root.recurringFromAccountId ?? undefined,
          toAccountId: root.recurringToAccountId ?? undefined,
          categoryId: root.categoryId ?? undefined,
          parentTransactionId: root.id
        });

        const next = computeNextOccurrence(root.occurredAt.getDate(), root.nextOccurrenceAt!, root.recurringInterval!);
        const ended = root.recurringEndDate ? next > root.recurringEndDate : false;

        await this.prisma.transaction.update({
          where: { id: root.id },
          data: ended
            ? { recurringStatus: RecurringStatus.CANCELLED, nextOccurrenceAt: null }
            : { nextOccurrenceAt: next }
        });
      } catch (error) {
        this.logger.error(`Failed to generate recurring occurrence for transaction ${root.id}`, error as Error);
      }
    }
  }
}
