import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Goal,
  GoalInstance,
  GoalRecurrenceUnit,
  GoalStatus,
  GoalType,
  Prisma,
  TransactionType,
} from '@prisma/client';
import {
  inclusiveUpperBound,
  lowerBound,
} from '../../common/utils/date-bounds';
import { withAdvisoryLock } from '../../common/utils/advisory-lock';
import { PrismaService } from '../../database/prisma.service';
import { AccountAction, accountScope } from '../account-access/account-access';
import { AccountAccessService } from '../account-access/account-access.service';
import { CategoriesService } from '../categories/categories.service';
import {
  CreateGoalDto,
  GoalHistoryQueryDto,
  ListGoalsQueryDto,
  UpdateGoalDto,
} from './dto/goals.dto';

// UTC throughout, like AnalyticsService: local-server time would put a 23:30 transaction on the
// 31st in another month depending on the server's TZ.
function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function endOfMonth(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
}
function startOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}
function endOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
}

export function resolvePeriodBounds(
  anchor: Date,
  unit: GoalRecurrenceUnit,
): [Date, Date] {
  return unit === GoalRecurrenceUnit.MONTH
    ? [startOfMonth(anchor), endOfMonth(anchor)]
    : [startOfYear(anchor), endOfYear(anchor)];
}

/**
 * Where a history row's progress comes from: computed just now for the open
 * period, frozen when the goal was ended, or recorded when its period ended.
 */
export type GoalProgressSource = 'LIVE' | 'ENDED' | 'PERIOD_END';

/**
 * Finalizing stamps `computedAt` after `periodEnd`, while a sticky ACHIEVED is stamped during the
 * period, so ACHIEVED with `computedAt <= periodEnd` is achieved but still open.
 */
export function isOpenInstance(
  instance: Pick<GoalInstance, 'status' | 'computedAt' | 'periodEnd'>,
): boolean {
  return (
    instance.status === GoalStatus.IN_PROGRESS ||
    instance.computedAt <= instance.periodEnd
  );
}

function openInstancesOf(
  goalId: string | undefined,
  periodEndField: Prisma.FieldRef<'GoalInstance', 'DateTime'>,
): Prisma.GoalInstanceWhereInput {
  return {
    ...(goalId ? { goalId } : {}),
    OR: [
      { status: GoalStatus.IN_PROGRESS },
      { computedAt: { lte: periodEndField } },
    ],
  };
}

function startOfDay(now: Date): Date {
  return lowerBound(now.toISOString().slice(0, 10));
}

const GOAL_CATEGORY_SELECT = {
  id: true,
  name: true,
  color: true,
  archivedAt: true,
} satisfies Prisma.CategorySelect;

/**
 * Same attribution as analytics: a split line counts under its own category; a line without one
 * falls back to the transaction's category only when no line of it carries one (an unsplit one).
 */
function categoryLineFilter(
  categoryId: string,
): Prisma.TransactionItemWhereInput {
  return {
    OR: [
      { categoryId },
      {
        categoryId: null,
        transaction: { categoryId, items: { every: { categoryId: null } } },
      },
    ],
  };
}

/** Arbitrary but stable key of the rollover's advisory lock (see withAdvisoryLock). */
const ROLLOVER_LOCK_KEY = 727_002_002;

@Injectable()
export class GoalsService {
  private readonly logger = new Logger(GoalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccountAccessService,
    private readonly categories: CategoriesService,
  ) {}

  async create(
    userId: string,
    dto: CreateGoalDto,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const { account } = await this.access.assertAccess(
      userId,
      dto.accountId,
      'goals',
      { db, activeOnly: true },
    );
    // The category must belong to the ledger the goal counts, and match its type.
    const categoryId =
      dto.type === GoalType.BALANCE ? null : (dto.categoryId ?? null);
    await this.categories.assertAssignable(
      account.userId,
      dto.type === GoalType.INCOME
        ? TransactionType.INCOME
        : TransactionType.EXPENSE,
      categoryId,
      db,
    );

    let periodStart: Date;
    let periodEnd: Date;
    if (dto.isRecurring) {
      [periodStart, periodEnd] = resolvePeriodBounds(
        new Date(dto.periodStart),
        dto.recurrenceUnit!,
      );
    } else {
      // Stored inclusively (23:59:59.999), so a date-only end counts its whole last day and the
      // goal finalizes once that day is over.
      periodStart = lowerBound(dto.periodStart);
      periodEnd = inclusiveUpperBound(dto.periodEnd!);
    }

    return db.goal.create({
      data: {
        // Goals sit with the account: its owner's, whoever on it created them.
        userId: account.userId,
        accountId: account.id,
        categoryId,
        name: dto.name,
        type: dto.type,
        targetAmount: new Prisma.Decimal(dto.targetAmount),
        isRecurring: dto.isRecurring,
        recurrenceUnit: dto.isRecurring ? dto.recurrenceUnit : null,
        periodStart,
        periodEnd: dto.isRecurring ? null : periodEnd,
        instances: {
          create: {
            periodStart,
            periodEnd,
            targetAmount: new Prisma.Decimal(dto.targetAmount),
          },
        },
      },
      include: { instances: true, category: { select: GOAL_CATEGORY_SELECT } },
    });
  }

  async list(userId: string, query: ListGoalsQueryDto) {
    const archivedFilter =
      query.status === 'active'
        ? { archivedAt: null }
        : query.status === 'archived'
          ? { archivedAt: { not: null } }
          : {};
    const page = await this.prisma.paginated.goal.paginate({
      where: { account: accountScope(userId, 'view'), ...archivedFilter },
      orderBy: { createdAt: 'desc' },
      include: {
        instances: { orderBy: { periodStart: 'desc' }, take: 1 },
        category: { select: GOAL_CATEGORY_SELECT },
      },
      limit: query.limit,
      offset: query.offset,
    });
    // Cast: paginate() can't keep an inline include's type through its generics (a Prisma
    // $allModels limitation); the include is still applied.
    const data = await Promise.all(
      page.data.map((goal) =>
        this.withLiveProgress(goal as Goal & { instances: GoalInstance[] }),
      ),
    );
    return { ...page, data };
  }

  // Doesn't exclude archived goals: stopping a goal must not hide its history. Reached through its
  // account: anyone on it sees it; others get the 404 of a missing id.
  async assertAccess(
    userId: string,
    goalId: string,
    action: AccountAction = 'view',
  ) {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, account: accountScope(userId, 'view') },
    });
    if (!goal) throw new NotFoundException(`Goal ${goalId} not found`);
    if (action !== 'view')
      await this.access.assertAccess(userId, goal.accountId, action);
    return goal;
  }

  async findOne(userId: string, goalId: string) {
    await this.assertAccess(userId, goalId);
    const goal = await this.prisma.goal.findFirstOrThrow({
      where: { id: goalId },
      include: {
        instances: { orderBy: { periodStart: 'desc' }, take: 1 },
        category: { select: GOAL_CATEGORY_SELECT },
      },
    });
    return this.withLiveProgress(goal);
  }

  /**
   * Finished periods show what was recorded and are never recomputed, so editing an old transaction
   * can't rewrite a past result.
   */
  async history(userId: string, goalId: string, query: GoalHistoryQueryDto) {
    const goal = await this.assertAccess(userId, goalId);
    const page = await this.prisma.paginated.goalInstance.paginate({
      where: { goalId },
      orderBy: { periodStart: 'desc' },
      limit: query.limit,
      offset: query.offset,
    });
    const now = new Date();
    const data = await Promise.all(
      page.data.map(async (instance) => {
        if (!isOpenInstance(instance))
          return {
            ...instance,
            progressSource: 'PERIOD_END' as GoalProgressSource,
          };
        if (goal.archivedAt)
          return { ...instance, progressSource: 'ENDED' as GoalProgressSource };
        const live = await this.liveInstance(goal, instance, now);
        return { ...live, progressSource: 'LIVE' as GoalProgressSource };
      }),
    );
    return { ...page, data };
  }

  async update(userId: string, goalId: string, dto: UpdateGoalDto) {
    const goal = await this.assertAccess(userId, goalId, 'goals');
    const targetAmount =
      dto.targetAmount !== undefined
        ? new Prisma.Decimal(dto.targetAmount)
        : undefined;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.goal.update({
        where: { id: goal.id },
        data: { name: dto.name, targetAmount },
      });
      if (targetAmount !== undefined) {
        const open = {
          goalId: goal.id,
          OR: [
            { status: GoalStatus.IN_PROGRESS },
            { periodEnd: { gte: new Date() } },
          ],
        };
        // Raising the target of an achieved goal drops the sticky ACHIEVED so it is judged against
        // the new one; lowering keeps it.
        await tx.goalInstance.updateMany({
          where: {
            ...open,
            status: GoalStatus.ACHIEVED,
            targetAmount: { lt: targetAmount },
          },
          data: { status: GoalStatus.IN_PROGRESS },
        });
        await tx.goalInstance.updateMany({
          where: open,
          data: { targetAmount },
        });
      }
      return updated;
    });
  }

  /**
   * Ending freezes the open period's progress; nothing recomputes it while ended (see restore). A
   * period already over but unfinalized is finalized here, as the rollover would.
   */
  async archive(userId: string, goalId: string) {
    const goal = await this.assertAccess(userId, goalId, 'goals');
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const open = await tx.goalInstance.findMany({
        where: openInstancesOf(goal.id, tx.goalInstance.fields.periodEnd),
      });
      for (const instance of open) {
        if (now < instance.periodStart) continue; // hasn't started, nothing to freeze
        const periodEnded = now > instance.periodEnd;
        const progressAmount = await this.computeProgressAmount(
          goal,
          instance.periodStart,
          instance.periodEnd,
          now,
        );
        let status = this.evaluateStatus(
          goal.type,
          progressAmount,
          instance.targetAmount,
          periodEnded,
          instance.status,
        );
        // An expense cap is only judged when its period ends, so ending a goal
        // that's over its cap leaves it unjudged rather than recording FAILED.
        if (!periodEnded && status === GoalStatus.FAILED)
          status = instance.status;
        await tx.goalInstance.update({
          where: { id: instance.id },
          data: { progressAmount, status, computedAt: now },
        });
      }
      return tx.goal.update({
        where: { id: goal.id },
        data: { archivedAt: now },
      });
    });
  }

  /**
   * Starts a fresh period from today; time spent ended is never backfilled. The period open when it
   * ended closes that day, judged on the progress frozen then.
   */
  async restore(userId: string, goalId: string) {
    const goal = await this.assertAccess(userId, goalId, 'goals');
    if (!goal.archivedAt)
      throw new NotFoundException(`Archived goal ${goalId} not found`);
    const endedAt = goal.archivedAt;
    const now = new Date();
    const today = startOfDay(now);

    return this.prisma.$transaction(async (tx) => {
      const open = await tx.goalInstance.findMany({
        where: openInstancesOf(goal.id, tx.goalInstance.fields.periodEnd),
        orderBy: { periodStart: 'asc' },
      });

      let reused = false;
      for (const instance of open) {
        if (instance.periodStart >= endedAt || instance.periodStart >= today) {
          const periodStart =
            instance.periodStart > today ? instance.periodStart : today;
          await tx.goalInstance.update({
            where: { id: instance.id },
            data: { periodStart },
          });
          reused = true;
          continue;
        }
        const periodEnd =
          instance.periodEnd < endedAt ? instance.periodEnd : endedAt;
        // Goals ended before ending froze their progress have no snapshot;
        // take their progress as of the moment they were ended.
        const progressAmount =
          instance.computedAt >= endedAt
            ? instance.progressAmount
            : await this.computeProgressAmount(
                goal,
                instance.periodStart,
                periodEnd,
                periodEnd,
              );
        const status = this.evaluateStatus(
          goal.type,
          progressAmount,
          instance.targetAmount,
          true,
          instance.status,
        );
        await tx.goalInstance.update({
          where: { id: instance.id },
          data: { periodEnd, progressAmount, status, computedAt: now },
        });
      }

      if (!reused) {
        const periodEnd = goal.isRecurring
          ? resolvePeriodBounds(today, goal.recurrenceUnit!)[1]
          : goal.periodEnd!;
        // A fixed goal whose end date passed while it was ended has nothing left to track.
        if (periodEnd >= now) {
          await tx.goalInstance.create({
            data: {
              goalId: goal.id,
              periodStart: today,
              periodEnd,
              targetAmount: goal.targetAmount,
            },
          });
        }
      }

      return tx.goal.update({
        where: { id: goal.id },
        data: { archivedAt: null },
      });
    });
  }

  private async withLiveProgress(goal: Goal & { instances: GoalInstance[] }) {
    const current = goal.instances[0];
    if (!current || goal.archivedAt || !isOpenInstance(current))
      return { ...goal, currentInstance: current ?? null };
    return {
      ...goal,
      currentInstance: await this.liveInstance(goal, current, new Date()),
    };
  }

  /**
   * Reach goals (BALANCE/INCOME) keep ACHIEVED once observed (stored), so a later dip doesn't undo
   * it. Expense caps stay live, so deleting an expense can bring a goal back under.
   */
  private async liveInstance(
    goal: Goal,
    instance: GoalInstance,
    now: Date,
  ): Promise<GoalInstance> {
    const progressAmount = await this.computeProgressAmount(
      goal,
      instance.periodStart,
      instance.periodEnd,
      now,
    );
    const status = this.evaluateStatus(
      goal.type,
      progressAmount,
      instance.targetAmount,
      now >= instance.periodEnd,
      instance.status,
    );
    if (
      status === GoalStatus.ACHIEVED &&
      instance.status === GoalStatus.IN_PROGRESS &&
      goal.type !== GoalType.EXPENSE &&
      now >= instance.periodStart
    ) {
      // Conditional on IN_PROGRESS so concurrent reads store it once.
      await this.prisma.goalInstance.updateMany({
        where: { id: instance.id, status: GoalStatus.IN_PROGRESS },
        data: { status, progressAmount, computedAt: now },
      });
    }
    return { ...instance, progressAmount, status, computedAt: now };
  }

  async computeProgressAmount(
    goal: Pick<Goal, 'type' | 'accountId' | 'userId'> &
      Partial<Pick<Goal, 'categoryId'>>,
    periodStart: Date,
    periodEnd: Date,
    now: Date,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Prisma.Decimal> {
    const boundary = now < periodEnd ? now : periodEnd;

    if (goal.type === GoalType.BALANCE) {
      // Net CREDIT/DEBIT in the database. Filtered by occurredAt (when money moved), not createdAt,
      // to match analytics for back-dated entries; the opening balance counts at any boundary.
      const rows = await db.transactionItem.groupBy({
        by: ['direction'],
        where: {
          userId: goal.userId,
          accountId: goal.accountId,
          transaction: { occurredAt: { lte: boundary }, deletedAt: null },
        },
        _sum: { amount: true },
      });
      const account = await db.account.findFirst({
        where: { id: goal.accountId, userId: goal.userId },
        select: { openingBalance: true },
      });
      return rows.reduce(
        (sum, row) => {
          const amount = row._sum.amount ?? new Prisma.Decimal(0);
          return row.direction === 'CREDIT'
            ? sum.plus(amount)
            : sum.minus(amount);
        },
        account?.openingBalance ?? new Prisma.Decimal(0),
      );
    }

    // Matches by the transaction's own type, like analytics, never by category type: gating on
    // category excluded every uncategorized transaction.
    const transactionType =
      goal.type === GoalType.INCOME
        ? TransactionType.INCOME
        : TransactionType.EXPENSE;
    const { _sum } = await db.transactionItem.aggregate({
      where: {
        userId: goal.userId,
        accountId: goal.accountId,
        transaction: {
          occurredAt: { gte: periodStart, lte: boundary },
          type: transactionType,
          deletedAt: null,
        },
        ...(goal.categoryId ? categoryLineFilter(goal.categoryId) : {}),
      },
      _sum: { amount: true },
    });
    return _sum.amount ?? new Prisma.Decimal(0);
  }

  /**
   * Reach goals are achieved once progress hits the target and stay so; EXPENSE fails the moment
   * spending exceeds the target and is achieved only when the period ends without that.
   */
  evaluateStatus(
    type: GoalType,
    progress: Prisma.Decimal,
    target: Prisma.Decimal,
    periodEnded: boolean,
    previousStatus: GoalStatus,
  ): GoalStatus {
    if (previousStatus === GoalStatus.ACHIEVED) return GoalStatus.ACHIEVED;

    if (type === GoalType.EXPENSE) {
      if (progress.gt(target)) return GoalStatus.FAILED;
      return periodEnded ? GoalStatus.ACHIEVED : GoalStatus.IN_PROGRESS;
    }

    if (progress.gte(target)) return GoalStatus.ACHIEVED;
    return periodEnded ? GoalStatus.FAILED : GoalStatus.IN_PROGRESS;
  }

  /**
   * Finalizes ended instances and opens the next period for recurring goals, one period per day, so
   * a long outage catches up gradually.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'UTC' })
  async runRollover() {
    const ran = await withAdvisoryLock(this.prisma, ROLLOVER_LOCK_KEY, () =>
      this.rolloverExpiredInstances(),
    );
    if (!ran) {
      this.logger.log(
        'Another instance holds the goals-rollover lock; skipping this run.',
      );
    }
  }

  async rolloverExpiredInstances() {
    const now = new Date();

    // Ended goals are frozen and skipped. An instance achieved during its period is still open (see
    // isOpenInstance) and is finalized here, staying ACHIEVED.
    const expired = await this.prisma.goalInstance.findMany({
      where: {
        periodEnd: { lt: now },
        goal: { archivedAt: null },
        ...openInstancesOf(
          undefined,
          this.prisma.goalInstance.fields.periodEnd,
        ),
      },
      include: { goal: true },
    });
    let finalized = 0;
    for (const instance of expired) {
      try {
        const progressAmount = await this.computeProgressAmount(
          instance.goal,
          instance.periodStart,
          instance.periodEnd,
          now,
        );
        const status = this.evaluateStatus(
          instance.goal.type,
          progressAmount,
          instance.targetAmount,
          true,
          instance.status,
        );
        await this.prisma.goalInstance.update({
          where: { id: instance.id },
          data: { progressAmount, status, computedAt: now },
        });
        finalized += 1;
      } catch (error) {
        this.logger.error(
          `Could not finalize goal instance ${instance.id} (goal ${instance.goalId}): ${(error as Error).message}`,
        );
      }
    }
    if (finalized)
      this.logger.log(`Finalized ${finalized} expired goal instance(s)`);

    const recurringGoals = await this.prisma.goal.findMany({
      where: { isRecurring: true, archivedAt: null },
      include: { instances: { orderBy: { periodStart: 'desc' }, take: 1 } },
    });
    let created = 0;
    for (const goal of recurringGoals) {
      const latest = goal.instances[0];
      if (latest && latest.periodEnd >= now) continue;

      try {
        if (!goal.recurrenceUnit)
          throw new Error('recurring goal has no recurrence unit');
        const anchor = latest
          ? new Date(latest.periodEnd.getTime() + 1)
          : goal.periodStart;
        const [periodStart, periodEnd] = resolvePeriodBounds(
          anchor,
          goal.recurrenceUnit,
        );
        await this.prisma.goalInstance.upsert({
          where: { goalId_periodStart: { goalId: goal.id, periodStart } },
          create: {
            goalId: goal.id,
            periodStart,
            periodEnd,
            targetAmount: goal.targetAmount,
          },
          update: {},
        });
        created += 1;
      } catch (error) {
        this.logger.error(
          `Could not open the next period of goal ${goal.id}: ${(error as Error).message}`,
        );
      }
    }
    if (created)
      this.logger.log(`Opened ${created} new recurring goal instance(s)`);
  }
}
