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
 * Editing, pausing, resuming and cancelling a series. Creating it and posting occurrences stay with
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
   * Read straight from the table, because the series' own template and ledger owner are what the
   * change works on, whatever the caller may see.
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
   * Only occurrences generated from now on are affected; the root's own entries and existing
   * occurrences are untouched.
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

    // Every occurrence posts in the series' currency, so each account must be live and in it; the
    // current account is checked too, since on a paused series it's often the one that broke.
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

    // Moving the end date or interval so the next occurrence falls past the end ends the series
    // now, as the cron would. Ended is final, like cancelled.
    const recurringEndDate =
      command.recurringEndDate === undefined
        ? root.recurringEndDate
        : command.recurringEndDate;
    const ended = nextOccurrenceAt
      ? isPastEndDate(nextOccurrenceAt, recurringEndDate)
      : false;

    // A cron-paused series keeps its reason only while it applies: moving it off an archived
    // account leaves it paused without the stale reason.
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
   * Nothing is generated until it's resumed. A manual pause has no recurringError, unlike a cron
   * pause.
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
   * Refuses with the reason while the series can't post. Occurrences due while paused are skipped,
   * not backfilled: the cron posts one a night, so a backfill would trickle for months.
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
   * Problems that don't go away by themselves (archived account, currency mismatch): the cron
   * pauses on one instead of failing nightly, and resume refuses while it remains.
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
