import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Account,
  Prisma,
  RecurringInterval,
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
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { LedgerService } from '../ledger/ledger.service';
import {
  CreateTransactionCommand,
  UpdateRecurringTransactionCommand,
  UpdateTransactionCommand,
} from './dto/transactions.dto';
import { TRANSACTION_INCLUDE } from './transaction-include';

type Db = Prisma.TransactionClient;

/**
 * Advances a recurring occurrence by one interval, clamping to the anchor's
 * day-of-month when the target month is shorter (e.g. Jan 31 -> Feb 28 -> Mar 31).
 * `anchor` is always the root transaction's original occurredAt, so the clamp
 * is computed against the fixed anchor day rather than compounding drift.
 *
 * UTC throughout (matching AnalyticsService.getMonthlySummary and
 * GoalsService's period bounds) — `anchorDay` must come from `getUTCDate()`
 * too, since mixing a local-time day-of-month with UTC month arithmetic here
 * would reintroduce the same server-timezone-dependent bug at month
 * boundaries (audit DATA-XX).
 */
export function computeNextOccurrence(
  anchorDay: number,
  from: Date,
  interval: RecurringInterval,
): Date {
  const monthsToAdd = interval === RecurringInterval.MONTHLY ? 1 : 12;
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + monthsToAdd;
  const daysInTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay, daysInTargetMonth);
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

/**
 * Whether a series' next occurrence falls after its end date. The end date is
 * inclusive: an occurrence landing exactly on it is still posted. A series
 * past its end is ended (CANCELLED with no next occurrence) rather than left
 * active, so the cron never posts a charge the user excluded.
 */
export function isPastEndDate(
  nextOccurrenceAt: Date,
  recurringEndDate: Date | null | undefined,
): boolean {
  return recurringEndDate ? nextOccurrenceAt > recurringEndDate : false;
}

/**
 * The first occurrence of a series on or after `day`, stepping its cursor
 * forward one interval at a time from `from` (clamped against the anchor day,
 * like the cron).
 */
export function firstOccurrenceOnOrAfter(
  anchorDay: number,
  from: Date,
  interval: RecurringInterval,
  day: Date,
): Date {
  let next = from;
  while (next < day) next = computeNextOccurrence(anchorDay, next, interval);
  return next;
}

/** What a series posts each time: enough of its root to tell whether it still can. */
export type SeriesTemplate = Pick<
  Transaction,
  | 'type'
  | 'currency'
  | 'categoryId'
  | 'recurringFromAccountId'
  | 'recurringToAccountId'
>;

/** Why a series can't post to this account, in words for the user, or null when it can. */
function accountProblem(
  account: Pick<Account, 'name' | 'currency' | 'archivedAt'>,
  currency: string,
): string | null {
  if (account.archivedAt) return `Account ${account.name} is archived`;
  if (account.currency !== currency) {
    return `Account ${account.name} is in ${account.currency}, but the series is in ${currency}`;
  }
  return null;
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly categoriesService: CategoriesService,
    private readonly accountsService: AccountsService,
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

  private async getRecurringRoot(userId: string, id: string) {
    const transaction = await this.findLive(userId, id);
    if (!transaction.isRecurring || transaction.parentTransactionId) {
      throw new BadRequestException(
        'Transaction is not the root of a recurring series',
      );
    }
    return transaction;
  }

  /**
   * Edits the recurrence template. Only affects occurrences generated from
   * now on — the root's own ledger entries and any already-generated
   * occurrence are left untouched.
   */
  async updateRecurring(
    userId: string,
    id: string,
    command: UpdateRecurringTransactionCommand,
  ) {
    const root = await this.getRecurringRoot(userId, id);
    if (root.recurringStatus === RecurringStatus.CANCELLED) {
      throw new BadRequestException('Cannot edit a cancelled recurring series');
    }

    const fromAccountId =
      command.fromAccountId ?? root.recurringFromAccountId ?? undefined;
    const toAccountId =
      command.toAccountId ?? root.recurringToAccountId ?? undefined;
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
    if (
      root.type === TransactionType.TRANSFER &&
      (!fromAccountId || !toAccountId)
    ) {
      throw new BadRequestException(
        'Transfer requires fromAccountId and toAccountId',
      );
    }

    // Every occurrence posts in the series' currency, so each account must be
    // live and in that currency, and a transfer needs two different ones. The
    // account the series already uses is checked too: on a paused series it's
    // often the one that broke, and the edit is how it gets replaced.
    const errors: { path: string; message: string }[] = [];
    for (const [path, accountId] of [
      ['fromAccountId', fromAccountId],
      ['toAccountId', toAccountId],
    ] as const) {
      if (!accountId) continue;
      const problem = accountProblem(
        await this.accountsService.assertOwned(userId, accountId),
        root.currency,
      );
      if (problem) errors.push({ path, message: problem });
    }
    if (
      root.type === TransactionType.TRANSFER &&
      fromAccountId === toAccountId
    ) {
      errors.push({
        path: 'toAccountId',
        message: 'Choose a different account from the one it transfers from',
      });
    }
    if (errors.length) {
      throw new BadRequestException({
        message: errors.map((error) => error.message).join('. '),
        errors,
      });
    }
    if (command.categoryId)
      await this.categoriesService.assertAssignable(
        userId,
        root.type,
        command.categoryId,
      );

    let nextOccurrenceAt = root.nextOccurrenceAt;
    if (
      command.recurringInterval &&
      command.recurringInterval !== root.recurringInterval &&
      nextOccurrenceAt
    ) {
      const lastOccurrenceAt = new Date(nextOccurrenceAt);
      lastOccurrenceAt.setUTCMonth(
        lastOccurrenceAt.getUTCMonth() -
          (root.recurringInterval === RecurringInterval.MONTHLY ? 1 : 12),
      );
      nextOccurrenceAt = computeNextOccurrence(
        root.occurredAt.getUTCDate(),
        lastOccurrenceAt,
        command.recurringInterval,
      );
    }

    // Moving the end date (or the interval) so the next occurrence falls past
    // the end ends the series now, the same way the cron ends it after its
    // last occurrence. Ended is final: like a cancelled series it can't be
    // edited back to life.
    const recurringEndDate =
      command.recurringEndDate === undefined
        ? root.recurringEndDate
        : command.recurringEndDate;
    const ended = nextOccurrenceAt
      ? isPastEndDate(nextOccurrenceAt, recurringEndDate)
      : false;

    // A series the cron paused keeps its reason only while it still applies:
    // an edit that moves it off an archived account leaves it paused (the user
    // resumes it) without the stale reason.
    const recurringError =
      root.recurringStatus === RecurringStatus.PAUSED && root.recurringError
        ? await this.findSeriesProblem(userId, {
            type: root.type,
            currency: root.currency,
            categoryId:
              command.categoryId === undefined
                ? root.categoryId
                : command.categoryId,
            recurringFromAccountId: fromAccountId ?? null,
            recurringToAccountId: toAccountId ?? null,
          })
        : undefined;

    return this.prisma.transaction.update({
      where: { id: root.id },
      data: {
        description: command.description,
        categoryId:
          command.categoryId === null
            ? null
            : (command.categoryId ?? undefined),
        recurringAmount: command.amount
          ? new Prisma.Decimal(command.amount)
          : undefined,
        recurringFromAccountId: command.fromAccountId,
        recurringToAccountId: command.toAccountId,
        recurringInterval: command.recurringInterval,
        recurringEndDate:
          command.recurringEndDate === null
            ? null
            : (command.recurringEndDate ?? undefined),
        recurringError,
        ...(ended
          ? {
              recurringStatus: RecurringStatus.CANCELLED,
              nextOccurrenceAt: null,
            }
          : { nextOccurrenceAt }),
      },
      include: TRANSACTION_INCLUDE,
    });
  }

  /**
   * Holds an active series: nothing is generated until it's resumed. A manual
   * pause has no reason (recurringError), unlike one the cron makes.
   */
  async pauseRecurring(userId: string, id: string) {
    const root = await this.getRecurringRoot(userId, id);
    if (root.recurringStatus !== RecurringStatus.ACTIVE) {
      throw new BadRequestException(
        'Only an active recurring series can be paused',
      );
    }
    // Conditional on the status so a cancel or a cron pause racing this one isn't overwritten.
    const claimed = await this.prisma.transaction.updateMany({
      where: {
        id: root.id,
        userId,
        deletedAt: null,
        recurringStatus: RecurringStatus.ACTIVE,
      },
      data: { recurringStatus: RecurringStatus.PAUSED, recurringError: null },
    });
    if (claimed.count === 0)
      throw new BadRequestException(
        'Only an active recurring series can be paused',
      );
    return this.getById(userId, root.id);
  }

  /**
   * Picks a paused series up again, once it can post: while the reason it was
   * paused for still applies, this 400s with that reason and it stays paused.
   *
   * The occurrences that fell due while paused are skipped, not backfilled:
   * the cursor moves to the first occurrence on or after today. The cron posts
   * one occurrence per series per night, so a backfill would trickle a
   * months-long gap in at one charge a night instead.
   */
  async resumeRecurring(userId: string, id: string) {
    const root = await this.getRecurringRoot(userId, id);
    if (root.recurringStatus !== RecurringStatus.PAUSED) {
      throw new BadRequestException(
        'Only a paused recurring series can be resumed',
      );
    }
    const problem = await this.findSeriesProblem(userId, root);
    if (problem) {
      // Kept on the series too, so the panel says why it's still paused (a
      // manual pause has no reason until the user tries to resume it).
      await this.prisma.transaction.updateMany({
        where: {
          id: root.id,
          userId,
          deletedAt: null,
          recurringStatus: RecurringStatus.PAUSED,
        },
        data: { recurringError: problem },
      });
      throw new BadRequestException(problem);
    }

    const anchorDay = root.occurredAt.getUTCDate();
    const interval = root.recurringInterval!;
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const cursor =
      root.nextOccurrenceAt ??
      computeNextOccurrence(anchorDay, root.occurredAt, interval);
    const nextOccurrenceAt = firstOccurrenceOnOrAfter(
      anchorDay,
      cursor,
      interval,
      today,
    );
    // Like an edit, skipping ahead can land past the end date: then the series is over.
    const ended = isPastEndDate(nextOccurrenceAt, root.recurringEndDate);

    const claimed = await this.prisma.transaction.updateMany({
      where: {
        id: root.id,
        userId,
        deletedAt: null,
        recurringStatus: RecurringStatus.PAUSED,
      },
      data: {
        recurringError: null,
        lastFailedAt: null,
        ...(ended
          ? {
              recurringStatus: RecurringStatus.CANCELLED,
              nextOccurrenceAt: null,
            }
          : { recurringStatus: RecurringStatus.ACTIVE, nextOccurrenceAt }),
      },
    });
    if (claimed.count === 0)
      throw new BadRequestException(
        'Only a paused recurring series can be resumed',
      );
    return this.getById(userId, root.id);
  }

  /**
   * Why a series can't post its next occurrence, in words the user can act on,
   * or null when it can. These are the problems that don't go away by
   * themselves (an archived account, a currency mismatch...): the cron pauses a
   * series on one instead of failing on it every night, and resume refuses
   * while one remains. Each occurrence still goes through create()'s own
   * validation on top of this.
   */
  async findSeriesProblem(
    userId: string,
    series: SeriesTemplate,
  ): Promise<string | null> {
    const {
      type,
      recurringFromAccountId: fromId,
      recurringToAccountId: toId,
    } = series;
    if (type !== TransactionType.INCOME && !fromId)
      return 'The series has no account to post from';
    if (type !== TransactionType.EXPENSE && !toId)
      return 'The series has no account to post to';
    if (type === TransactionType.TRANSFER && fromId === toId) {
      return 'The series transfers from and to the same account';
    }

    const accountIds = [
      type !== TransactionType.INCOME ? fromId : null,
      type !== TransactionType.EXPENSE ? toId : null,
    ];
    for (const accountId of accountIds) {
      if (!accountId) continue;
      const account = await this.accountsService
        .assertOwned(userId, accountId)
        .catch(() => null);
      if (!account) return 'An account of this series no longer exists';
      const problem = accountProblem(account, series.currency);
      if (problem) return problem;
    }

    if (series.categoryId) {
      try {
        await this.categoriesService.assertAssignable(
          userId,
          type,
          series.categoryId,
        );
      } catch (error) {
        if (error instanceof NotFoundException)
          return 'The category of this series no longer exists';
        if (error instanceof HttpException) return error.message;
        throw error;
      }
    }
    return null;
  }

  /** Stops future generation. Already-generated occurrences (past or future-dated) are left as-is. */
  async cancelRecurring(userId: string, id: string) {
    const root = await this.getRecurringRoot(userId, id);
    // Conditional on the status so a cron end that landed first isn't re-applied.
    await this.prisma.transaction.updateMany({
      where: {
        id: root.id,
        userId,
        deletedAt: null,
        recurringStatus: { not: RecurringStatus.CANCELLED },
      },
      data: { recurringStatus: RecurringStatus.CANCELLED },
    });
    return this.getById(userId, root.id);
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
