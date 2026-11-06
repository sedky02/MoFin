import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Account,
  Prisma,
  RecurringInterval,
  RecurringStatus,
  Transaction,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AccountAccessService } from '../account-access/account-access.service';
import { CategoriesService } from '../categories/categories.service';
import { UpdateRecurringTransactionCommand } from './dto/transactions.dto';
import {
  computeNextOccurrence,
  firstOccurrenceOnOrAfter,
  isPastEndDate,
} from './recurrence';
import { TRANSACTION_INCLUDE } from './transaction-include';
import { TransactionsService } from './transactions.service';

/** What a series posts each time: enough of its root to tell whether it still can. */
export type SeriesTemplate = Pick<
  Transaction,
  | 'userId'
  | 'type'
  | 'currency'
  | 'categoryId'
  | 'recurringFromAccountId'
  | 'recurringToAccountId'
>;

const DIFFERENT_OWNER_PROBLEM =
  'A series can only post to accounts with the same owner';

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

/**
 * The lifecycle of a recurring series, from its root transaction: editing the
 * template, pausing, resuming and cancelling it, and telling whether it can
 * still post. Creating the series and posting its occurrences stay with
 * TransactionsService, so a series change never touches a ledger entry.
 */
@Injectable()
export class RecurringSeriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionsService: TransactionsService,
    private readonly categoriesService: CategoriesService,
    private readonly access: AccountAccessService,
  ) {}

  /**
   * The root, for a change to its series: `transact` on every account it
   * touches. Read straight from the table, because the series' own template and
   * ledger owner are what the change works on, whatever the caller may see.
   */
  private async getRecurringRoot(userId: string, id: string) {
    await this.access.assertTransactionAccess(userId, id, 'transact');
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, deletedAt: null },
      include: TRANSACTION_INCLUDE,
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
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
      const { account } = await this.access.assertAccess(
        userId,
        accountId,
        'transact',
      );
      const problem =
        account.userId === root.userId
          ? accountProblem(account, root.currency)
          : DIFFERENT_OWNER_PROBLEM;
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
        root.userId,
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
        ? await this.findSeriesProblem({
            userId: root.userId,
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
        updatedById: userId,
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
        deletedAt: null,
        recurringStatus: RecurringStatus.ACTIVE,
      },
      data: { recurringStatus: RecurringStatus.PAUSED, recurringError: null },
    });
    if (claimed.count === 0)
      throw new BadRequestException(
        'Only an active recurring series can be paused',
      );
    return this.transactionsService.getById(userId, root.id);
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
    const problem = await this.findSeriesProblem(root);
    if (problem) {
      // Kept on the series too, so the panel says why it's still paused (a
      // manual pause has no reason until the user tries to resume it).
      await this.prisma.transaction.updateMany({
        where: {
          id: root.id,
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
    return this.transactionsService.getById(userId, root.id);
  }

  /**
   * Why a series can't post its next occurrence, in words the user can act on,
   * or null when it can. These are the problems that don't go away by
   * themselves (an archived account, a currency mismatch...): the cron pauses a
   * series on one instead of failing on it every night, and resume refuses
   * while one remains. Each occurrence still goes through create()'s own
   * validation on top of this.
   */
  async findSeriesProblem(series: SeriesTemplate): Promise<string | null> {
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
      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
      });
      if (!account) return 'An account of this series no longer exists';
      if (account.userId !== series.userId) return DIFFERENT_OWNER_PROBLEM;
      const problem = accountProblem(account, series.currency);
      if (problem) return problem;
    }

    if (series.categoryId) {
      try {
        await this.categoriesService.assertAssignable(
          series.userId,
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
        deletedAt: null,
        recurringStatus: { not: RecurringStatus.CANCELLED },
      },
      data: { recurringStatus: RecurringStatus.CANCELLED },
    });
    return this.transactionsService.getById(userId, root.id);
  }
}
