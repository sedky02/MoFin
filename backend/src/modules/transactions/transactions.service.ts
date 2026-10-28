import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  RecurringStatus,
  Transaction,
  TransactionType,
} from '@prisma/client';
import {
  DomainEvents,
  TransactionChangedEvent,
  TransactionCreatedEvent,
} from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { LedgerService } from '../ledger/ledger.service';
import {
  CreateTransactionCommand,
  UpdateTransactionCommand,
} from './dto/transactions.dto';
import { computeNextOccurrence, isPastEndDate } from './recurrence';
import { TRANSACTION_INCLUDE } from './transaction-include';

type Db = Prisma.TransactionClient;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly categoriesService: CategoriesService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Creates a transaction and its ledger entries atomically. Pass `db` when
   * the caller needs this create to participate in a larger transaction (e.g.
   * the recurring cron creating an occurrence and advancing its cursor in one
   * commit) — in that case the caller owns the transaction boundary and is
   * responsible for emitting TransactionCreated once its own transaction
   * commits, since emitting beforehand could let listeners react to a row a
   * later step in that same transaction rolls back.
   */
  async create(userId: string, command: CreateTransactionCommand, db?: Db) {
    this.validateCommand(command);
    // The checks read through the caller's transaction too, so a caller that
    // created the account or category earlier in that transaction can see it.
    const reader = db ?? this.prisma;
    await this.categoriesService.assertAssignable(
      userId,
      command.type,
      command.categoryId,
      reader,
    );
    for (const item of command.items ?? []) {
      await this.categoriesService.assertAssignable(
        userId,
        command.type,
        item.categoryId,
        reader,
      );
    }
    const ledgerEntries = await this.ledgerService.buildEntriesForCommand(
      userId,
      command,
      reader,
    );

    const firstNextOccurrenceAt = command.isRecurring
      ? computeNextOccurrence(
          command.occurredAt.getUTCDate(),
          command.occurredAt,
          command.recurringInterval!,
        )
      : null;
    // The root itself is always posted; if the end date already excludes the
    // next occurrence there's nothing left to generate, so it starts ended.
    const endedAtCreate = firstNextOccurrenceAt
      ? isPastEndDate(firstNextOccurrenceAt, command.recurringEndDate)
      : false;

    const run = async (db: Db) => {
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
                recurringStatus: endedAtCreate
                  ? RecurringStatus.CANCELLED
                  : RecurringStatus.ACTIVE,
                recurringEndDate: command.recurringEndDate,
                recurringAmount: new Prisma.Decimal(command.amount),
                recurringFromAccountId: command.fromAccountId,
                recurringToAccountId: command.toAccountId,
                nextOccurrenceAt: endedAtCreate ? null : firstNextOccurrenceAt,
              }
            : {}),
        },
      });

      await this.ledgerService.createEntries(
        db,
        userId,
        created.id,
        ledgerEntries,
      );
      return db.transaction.findUniqueOrThrow({
        where: { id: created.id },
        include: TRANSACTION_INCLUDE,
      });
    };

    const transaction = db
      ? await run(db)
      : await this.prisma.$transaction(run);

    if (!db) this.announceCreated(transaction);

    return transaction;
  }

  /**
   * Tells listeners (the analytics cache) a transaction now exists. create()
   * calls it itself; a caller that passed `db` calls it once its own
   * transaction has committed.
   */
  announceCreated(
    transaction: Pick<Transaction, 'id' | 'userId' | 'occurredAt'>,
  ) {
    this.events.emit(DomainEvents.TransactionCreated, {
      transactionId: transaction.id,
      userId: transaction.userId,
      occurredAt: transaction.occurredAt,
    } satisfies TransactionCreatedEvent);
  }

  async getById(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId, deletedAt: null },
      include: TRANSACTION_INCLUDE,
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  /**
   * Replaces a transaction's fields and ledger lines. Transactions are the
   * user's own records, so an edit rewrites them in place: the same validation
   * as create runs on the new values, then the old lines are swapped for the
   * new ones in one database transaction, so balances move by exactly the
   * difference. A recurring root keeps its type and currency, because its
   * series template generates future occurrences from them.
   */
  async update(userId: string, id: string, command: UpdateTransactionCommand) {
    const existing = await this.findLive(userId, id);
    if (existing.isRecurring && !existing.parentTransactionId) {
      if (command.type !== existing.type) {
        throw new BadRequestException(
          "A recurring series can't change type; delete it and create a new one",
        );
      }
      if (command.currency !== existing.currency) {
        throw new BadRequestException(
          "A recurring series can't change currency; delete it and create a new one",
        );
      }
      // Same rule as create: a recurring transaction is never split.
      if ((command.items?.length ?? 0) > 1) {
        throw new BadRequestException(
          "A recurring transaction can't be split into items",
        );
      }
    }

    this.validateCommand(command);

    const updated = await this.prisma.$transaction(async (db) => {
      // Checked inside the write's own transaction, as create() does, so the
      // gap between the check and the write is one transaction, not a request.
      await this.categoriesService.assertAssignable(
        userId,
        command.type,
        command.categoryId,
        db,
      );
      for (const item of command.items ?? []) {
        await this.categoriesService.assertAssignable(
          userId,
          command.type,
          item.categoryId,
          db,
        );
      }
      const ledgerEntries = await this.ledgerService.buildEntriesForCommand(
        userId,
        command,
        db,
      );
      // Conditional on deletedAt so a delete racing this edit wins cleanly instead of being undone.
      const claimed = await db.transaction.updateMany({
        where: { id, userId, deletedAt: null },
        data: {
          type: command.type,
          description: command.description,
          currency: command.currency,
          categoryId: command.categoryId ?? null,
          occurredAt: command.occurredAt,
        },
      });
      if (claimed.count === 0)
        throw new NotFoundException('Transaction not found');
      await db.transactionItem.deleteMany({
        where: { transactionId: id, userId },
      });
      await this.ledgerService.createEntries(db, userId, id, ledgerEntries);
      return db.transaction.findUniqueOrThrow({
        where: { id },
        include: TRANSACTION_INCLUDE,
      });
    });

    // Cached summaries are per month: the month it left and the month it moved to both changed.
    this.emitChanged(userId, id, existing.occurredAt, updated.occurredAt);
    return updated;
  }

  /**
   * Soft-deletes a transaction: its rows stay (so it can be restored) but it
   * drops out of every balance, report, goal and list. Deleting the root of a
   * recurring series stops the series, because the cron skips deleted roots;
   * occurrences it already generated are separate records and stay.
   */
  async remove(userId: string, id: string) {
    const existing = await this.findLive(userId, id);
    const claimed = await this.prisma.transaction.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (claimed.count === 0)
      throw new NotFoundException('Transaction not found');
    this.emitChanged(userId, id, existing.occurredAt);
  }

  /** Undoes a delete. A restored recurring root picks its series up again. */
  async restore(userId: string, id: string) {
    const claimed = await this.prisma.transaction.updateMany({
      where: { id, userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (claimed.count === 0)
      throw new NotFoundException('Deleted transaction not found');
    const restored = await this.getById(userId, id);
    this.emitChanged(userId, id, restored.occurredAt);
    return restored;
  }

  /** A transaction of this user that isn't deleted, or 404 (another user's id looks the same as a missing one). */
  private async findLive(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  private emitChanged(
    userId: string,
    transactionId: string,
    ...months: Date[]
  ) {
    const seen = new Set<string>();
    for (const occurredAt of months) {
      const month = `${occurredAt.getUTCFullYear()}-${occurredAt.getUTCMonth()}`;
      if (seen.has(month)) continue;
      seen.add(month);
      this.events.emit(DomainEvents.TransactionChanged, {
        transactionId,
        userId,
        occurredAt,
      } satisfies TransactionChangedEvent);
    }
  }

  private validateCommand(
    command: CreateTransactionCommand | UpdateTransactionCommand,
  ) {
    if ('isRecurring' in command && command.isRecurring) {
      if (command.items?.length) {
        throw new BadRequestException(
          'Recurring transactions cannot use split items',
        );
      }
      if (!command.recurringInterval) {
        throw new BadRequestException(
          'Recurring transactions require recurringInterval',
        );
      }
      if (
        command.recurringEndDate &&
        command.recurringEndDate <= command.occurredAt
      ) {
        throw new BadRequestException(
          'recurringEndDate must be after occurredAt',
        );
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
    if (
      command.type === TransactionType.TRANSFER &&
      (!command.fromAccountId || !command.toAccountId)
    ) {
      throw new BadRequestException(
        'Transfer requires fromAccountId and toAccountId',
      );
    }
    if (
      command.type === TransactionType.TRANSFER &&
      command.fromAccountId === command.toAccountId
    ) {
      throw new BadRequestException('Transfer accounts must be different');
    }
    if (command.items?.length) {
      if (command.type === TransactionType.TRANSFER) {
        throw new BadRequestException(
          'Transfers cannot be split into multiple items',
        );
      }
      // A split's categories live on its lines. A top-level one as well would be a second,
      // conflicting answer, and analytics/search/the list would each pick a different one.
      // A single item is still the plain unsplit shape, so the top-level category is fine there.
      if (command.items.length > 1 && command.categoryId) {
        throw new BadRequestException(
          'A split transaction cannot have its own category; set a category on each split line instead',
        );
      }
      for (const item of command.items) {
        if (new Prisma.Decimal(item.amount).lessThanOrEqualTo(0)) {
          throw new BadRequestException(
            'Each split item amount must be greater than zero',
          );
        }
      }
      const itemsTotal = command.items.reduce(
        (sum, item) => sum.plus(item.amount),
        new Prisma.Decimal(0),
      );
      if (!itemsTotal.equals(new Prisma.Decimal(command.amount))) {
        throw new BadRequestException(
          'Split item amounts must add up to the transaction total',
        );
      }
    }
  }
}
