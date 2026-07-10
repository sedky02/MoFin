import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, RecurringInterval, RecurringStatus, TransactionType } from '@prisma/client';
import { DomainEvents, TransactionCreatedEvent } from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { LedgerService } from '../ledger/ledger.service';
import { CreateTransactionCommand, UpdateRecurringTransactionCommand } from './dto/transactions.dto';

/**
 * Advances a recurring occurrence by one interval, clamping to the anchor's
 * day-of-month when the target month is shorter (e.g. Jan 31 -> Feb 28 -> Mar 31).
 * `anchor` is always the root transaction's original occurredAt, so the clamp
 * is computed against the fixed anchor day rather than compounding drift.
 */
export function computeNextOccurrence(anchorDay: number, from: Date, interval: RecurringInterval): Date {
  const monthsToAdd = interval === RecurringInterval.MONTHLY ? 1 : 12;
  const year = from.getFullYear();
  const month = from.getMonth() + monthsToAdd;
  const daysInTargetMonth = new Date(year, month + 1, 0).getDate();
  const day = Math.min(anchorDay, daysInTargetMonth);
  return new Date(year, month, day, from.getHours(), from.getMinutes(), from.getSeconds(), from.getMilliseconds());
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly categoriesService: CategoriesService,
    private readonly accountsService: AccountsService,
    private readonly events: EventEmitter2
  ) {}

  async create(userId: string, command: CreateTransactionCommand) {
    this.validateCommand(command);
    await this.categoriesService.assertAvailable(userId, command.categoryId);
    for (const item of command.items ?? []) {
      await this.categoriesService.assertAvailable(userId, item.categoryId);
    }
    const ledgerEntries = await this.ledgerService.buildEntriesForCommand(userId, command);

    const transaction = await this.prisma.$transaction(async (db) => {
      const created = await db.transaction.create({
        data: {
          userId,
          draftId: command.draftId,
          type: command.type,
          description: command.description,
          currency: command.currency,
          categoryId: command.categoryId,
          occurredAt: command.occurredAt,
          parentTransactionId: command.parentTransactionId,
          ...(command.isRecurring
            ? {
                isRecurring: true,
                recurringInterval: command.recurringInterval,
                recurringStatus: RecurringStatus.ACTIVE,
                recurringEndDate: command.recurringEndDate,
                recurringAmount: new Prisma.Decimal(command.amount),
                recurringFromAccountId: command.fromAccountId,
                recurringToAccountId: command.toAccountId,
                nextOccurrenceAt: computeNextOccurrence(
                  command.occurredAt.getDate(),
                  command.occurredAt,
                  command.recurringInterval!
                )
              }
            : {})
        }
      });

      await this.ledgerService.createEntries(db, userId, created.id, ledgerEntries);
      return db.transaction.findUniqueOrThrow({
        where: { id: created.id },
        include: { items: { include: { category: true } }, category: true }
      });
    });

    this.events.emit(DomainEvents.TransactionCreated, {
      transactionId: transaction.id,
      userId,
      occurredAt: transaction.occurredAt
    } satisfies TransactionCreatedEvent);

    return transaction;
  }

  async getById(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: { items: { include: { category: true } }, category: true }
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  private async getRecurringRoot(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!transaction) throw new NotFoundException('Transaction not found');
    if (!transaction.isRecurring || transaction.parentTransactionId) {
      throw new BadRequestException('Transaction is not the root of a recurring series');
    }
    return transaction;
  }

  /**
   * Edits the recurrence template. Only affects occurrences generated from
   * now on — the root's own ledger entries and any already-generated
   * occurrence are left untouched.
   */
  async updateRecurring(userId: string, id: string, command: UpdateRecurringTransactionCommand) {
    const root = await this.getRecurringRoot(userId, id);
    if (root.recurringStatus === RecurringStatus.CANCELLED) {
      throw new BadRequestException('Cannot edit a cancelled recurring series');
    }

    const fromAccountId = command.fromAccountId ?? root.recurringFromAccountId ?? undefined;
    const toAccountId = command.toAccountId ?? root.recurringToAccountId ?? undefined;
    const amount = command.amount ?? root.recurringAmount!.toString();

    if (new Prisma.Decimal(amount).lessThanOrEqualTo(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    if (root.type === TransactionType.INCOME && !toAccountId) {
      throw new BadRequestException('Income requires toAccountId');
    }
    if (root.type === TransactionType.EXPENSE && !fromAccountId) {
      throw new BadRequestException('Expense requires fromAccountId');
    }
    if (root.type === TransactionType.TRANSFER && (!fromAccountId || !toAccountId)) {
      throw new BadRequestException('Transfer requires fromAccountId and toAccountId');
    }
    if (fromAccountId) await this.accountsService.assertOwned(userId, fromAccountId);
    if (toAccountId) await this.accountsService.assertOwned(userId, toAccountId);
    if (command.categoryId) await this.categoriesService.assertAvailable(userId, command.categoryId);

    let nextOccurrenceAt = root.nextOccurrenceAt;
    if (command.recurringInterval && command.recurringInterval !== root.recurringInterval && nextOccurrenceAt) {
      const lastOccurrenceAt = new Date(nextOccurrenceAt);
      lastOccurrenceAt.setMonth(
        lastOccurrenceAt.getMonth() - (root.recurringInterval === RecurringInterval.MONTHLY ? 1 : 12)
      );
      nextOccurrenceAt = computeNextOccurrence(root.occurredAt.getDate(), lastOccurrenceAt, command.recurringInterval);
    }

    return this.prisma.transaction.update({
      where: { id: root.id },
      data: {
        description: command.description,
        categoryId: command.categoryId === null ? null : (command.categoryId ?? undefined),
        recurringAmount: command.amount ? new Prisma.Decimal(command.amount) : undefined,
        recurringFromAccountId: command.fromAccountId,
        recurringToAccountId: command.toAccountId,
        recurringInterval: command.recurringInterval,
        recurringEndDate:
          command.recurringEndDate === null ? null : (command.recurringEndDate ?? undefined),
        nextOccurrenceAt
      },
      include: { items: { include: { category: true } }, category: true }
    });
  }

  /** Stops future generation. Already-generated occurrences (past or future-dated) are left as-is. */
  async cancelRecurring(userId: string, id: string) {
    const root = await this.getRecurringRoot(userId, id);
    return this.prisma.transaction.update({
      where: { id: root.id },
      data: { recurringStatus: RecurringStatus.CANCELLED },
      include: { items: { include: { category: true } }, category: true }
    });
  }

  private validateCommand(command: CreateTransactionCommand) {
    if (command.isRecurring) {
      if (command.items?.length) {
        throw new BadRequestException('Recurring transactions cannot use split items');
      }
      if (!command.recurringInterval) {
        throw new BadRequestException('Recurring transactions require recurringInterval');
      }
      if (command.recurringEndDate && command.recurringEndDate <= command.occurredAt) {
        throw new BadRequestException('recurringEndDate must be after occurredAt');
      }
    }
    if (new Prisma.Decimal(command.amount).lessThanOrEqualTo(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    if (command.type === TransactionType.INCOME && !command.toAccountId) {
      throw new BadRequestException('Income requires toAccountId');
    }
    if (command.type === TransactionType.EXPENSE && !command.fromAccountId) {
      throw new BadRequestException('Expense requires fromAccountId');
    }
    if (command.type === TransactionType.TRANSFER && (!command.fromAccountId || !command.toAccountId)) {
      throw new BadRequestException('Transfer requires fromAccountId and toAccountId');
    }
    if (command.type === TransactionType.TRANSFER && command.fromAccountId === command.toAccountId) {
      throw new BadRequestException('Transfer accounts must be different');
    }
    if (command.items?.length) {
      if (command.type === TransactionType.TRANSFER) {
        throw new BadRequestException('Transfers cannot be split into multiple items');
      }
      for (const item of command.items) {
        if (new Prisma.Decimal(item.amount).lessThanOrEqualTo(0)) {
          throw new BadRequestException('Each split item amount must be greater than zero');
        }
      }
      const itemsTotal = command.items.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
      if (!itemsTotal.equals(new Prisma.Decimal(command.amount))) {
        throw new BadRequestException('Split item amounts must add up to the transaction total');
      }
    }
  }
}
