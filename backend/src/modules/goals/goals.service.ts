import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Goal, GoalInstance, GoalRecurrenceUnit, GoalStatus, GoalType, Prisma, TransactionType } from '@prisma/client';
import { inclusiveUpperBound, lowerBound } from '../../common/utils/date-bounds';
import { PrismaService } from '../../database/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CreateGoalDto, GoalHistoryQueryDto, ListGoalsQueryDto, UpdateGoalDto } from './dto/goals.dto';

// UTC throughout (matching AnalyticsService.getMonthlySummary) — a
// local-server-time constructor here would put a transaction at 23:30 on the
// 31st in a different month/year depending only on the server's TZ, silently
// disagreeing with analytics in production (which typically runs UTC) while
// looking fine in local dev (audit DATA-XX).
function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}
function startOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}
function endOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
}

/** Resolves the calendar-aligned [start, end] bounds of the period containing `anchor`. */
export function resolvePeriodBounds(anchor: Date, unit: GoalRecurrenceUnit): [Date, Date] {
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
 * Whether an instance's period is still open, i.e. not yet judged. Finalizing
 * (rollover, or restoring an ended goal) always stamps `computedAt` after
 * `periodEnd`, while a sticky ACHIEVED is stamped during the period, so an
 * ACHIEVED row with `computedAt <= periodEnd` is achieved but still open.
 */
export function isOpenInstance(instance: Pick<GoalInstance, 'status' | 'computedAt' | 'periodEnd'>): boolean {
  return instance.status === GoalStatus.IN_PROGRESS || instance.computedAt <= instance.periodEnd;
}

/** Prisma filter matching `isOpenInstance`, optionally for one goal. */
function openInstancesOf(
  goalId: string | undefined,
  periodEndField: Prisma.FieldRef<'GoalInstance', 'DateTime'>,
): Prisma.GoalInstanceWhereInput {
  return {
    ...(goalId ? { goalId } : {}),
    OR: [{ status: GoalStatus.IN_PROGRESS }, { computedAt: { lte: periodEndField } }],
  };
}

/** 00:00 UTC of the day `now` falls on. */
function startOfDay(now: Date): Date {
  return lowerBound(now.toISOString().slice(0, 10));
}

@Injectable()
export class GoalsService {
  private readonly logger = new Logger(GoalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
  ) {}

  async create(userId: string, dto: CreateGoalDto) {
    const account = await this.accountsService.assertActive(userId, dto.accountId);

    let periodStart: Date;
    let periodEnd: Date;
    if (dto.isRecurring) {
      [periodStart, periodEnd] = resolvePeriodBounds(new Date(dto.periodStart), dto.recurrenceUnit!);
    } else {
      // Stored inclusively like a recurring period's end (23:59:59.999), so a
      // date-only end date counts its whole last day and the goal only
      // finalizes once that day is over.
      periodStart = lowerBound(dto.periodStart);
      periodEnd = inclusiveUpperBound(dto.periodEnd!);
    }

    return this.prisma.goal.create({
      data: {
        userId,
        accountId: account.id,
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
      include: { instances: true },
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
      where: { userId, ...archivedFilter },
      orderBy: { createdAt: 'desc' },
      include: { instances: { orderBy: { periodStart: 'desc' }, take: 1 } },
      limit: query.limit,
      offset: query.offset,
    });
    // Cast needed: the generic paginate() extension can't preserve an inline
    // `include`'s literal shape through its own generic inference (a known
    // Prisma limitation for $allModels extension methods) — the include
    // itself is still applied at the DB level, this only restores the type.
    const data = await Promise.all(
      page.data.map((goal) => this.withLiveProgress(goal as Goal & { instances: GoalInstance[] }))
    );
    return { ...page, data };
  }

  // Deliberately does NOT exclude archived goals — stopping a goal should not make its
  // history/details inaccessible, only remove it from the default active list.
  async assertOwned(userId: string, goalId: string) {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, userId } });
    if (!goal) throw new NotFoundException(`Goal ${goalId} not found`);
    return goal;
  }

  async findOne(userId: string, goalId: string) {
    await this.assertOwned(userId, goalId);
    const goal = await this.prisma.goal.findFirstOrThrow({
      where: { id: goalId },
      include: { instances: { orderBy: { periodStart: 'desc' }, take: 1 } },
    });
    return this.withLiveProgress(goal);
  }

  /**
   * Finished periods show what was recorded when they ended and are never
   * recomputed, so editing an old transaction can't rewrite a past result. The
   * open period gets the same live progress as the goal card.
   */
  async history(userId: string, goalId: string, query: GoalHistoryQueryDto) {
    const goal = await this.assertOwned(userId, goalId);
    const page = await this.prisma.paginated.goalInstance.paginate({
      where: { goalId },
      orderBy: { periodStart: 'desc' },
      limit: query.limit,
      offset: query.offset,
    });
    const now = new Date();
    const data = await Promise.all(
      page.data.map(async (instance) => {
        if (!isOpenInstance(instance)) return { ...instance, progressSource: 'PERIOD_END' as GoalProgressSource };
        if (goal.archivedAt) return { ...instance, progressSource: 'ENDED' as GoalProgressSource };
        const live = await this.liveInstance(goal, instance, now);
        return { ...live, progressSource: 'LIVE' as GoalProgressSource };
      }),
    );
    return { ...page, data };
  }

  async update(userId: string, goalId: string, dto: UpdateGoalDto) {
    const goal = await this.assertOwned(userId, goalId);
    const targetAmount = dto.targetAmount !== undefined ? new Prisma.Decimal(dto.targetAmount) : undefined;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.goal.update({
        where: { id: goal.id },
        data: { name: dto.name, targetAmount },
      });
      if (targetAmount !== undefined) {
        const open = { goalId: goal.id, OR: [{ status: GoalStatus.IN_PROGRESS }, { periodEnd: { gte: new Date() } }] };
        // Raising the target of a goal already achieved this period means it
        // hasn't reached the new one yet: drop the sticky ACHIEVED so it is
        // judged against the new target. Lowering it keeps the achievement.
        await tx.goalInstance.updateMany({
          where: { ...open, status: GoalStatus.ACHIEVED, targetAmount: { lt: targetAmount } },
          data: { status: GoalStatus.IN_PROGRESS },
        });
        await tx.goalInstance.updateMany({ where: open, data: { targetAmount } });
      }
      return updated;
    });
  }

  /**
   * Ending a goal freezes it: the open period keeps the progress it had at this
   * moment, and nothing recomputes, rolls over or finalizes it while it's ended
   * (see `restore` for what happens to that period afterwards). A period that
   * had already ended but wasn't finalized yet is finalized here, as the
   * rollover would have.
   */
  async archive(userId: string, goalId: string) {
    const goal = await this.assertOwned(userId, goalId);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const open = await tx.goalInstance.findMany({ where: openInstancesOf(goal.id, tx.goalInstance.fields.periodEnd) });
      for (const instance of open) {
        if (now < instance.periodStart) continue; // hasn't started, nothing to freeze
        const periodEnded = now > instance.periodEnd;
        const progressAmount = await this.computeProgressAmount(goal, instance.periodStart, instance.periodEnd, now);
        let status = this.evaluateStatus(goal.type, progressAmount, instance.targetAmount, periodEnded, instance.status);
        // An expense cap is only judged when its period ends, so ending a goal
        // that's over its cap leaves it unjudged rather than recording FAILED.
        if (!periodEnded && status === GoalStatus.FAILED) status = instance.status;
        await tx.goalInstance.update({ where: { id: instance.id }, data: { progressAmount, status, computedAt: now } });
      }
      return tx.goal.update({ where: { id: goal.id }, data: { archivedAt: now } });
    });
  }

  /**
   * Reverses `archive` by starting a fresh period from today; the time the goal
   * spent ended is never backfilled. The period that was open when it was ended
   * closes on that day and is judged on the progress frozen then. A period that
   * hadn't started by then, or starts today anyway, is reused as the fresh one.
   */
  async restore(userId: string, goalId: string) {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, userId, archivedAt: { not: null } } });
    if (!goal) throw new NotFoundException(`Archived goal ${goalId} not found`);
    const endedAt = goal.archivedAt!;
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
          const periodStart = instance.periodStart > today ? instance.periodStart : today;
          await tx.goalInstance.update({ where: { id: instance.id }, data: { periodStart } });
          reused = true;
          continue;
        }
        const periodEnd = instance.periodEnd < endedAt ? instance.periodEnd : endedAt;
        // Goals ended before ending froze their progress have no snapshot;
        // take their progress as of the moment they were ended.
        const progressAmount =
          instance.computedAt >= endedAt
            ? instance.progressAmount
            : await this.computeProgressAmount(goal, instance.periodStart, periodEnd, periodEnd);
        const status = this.evaluateStatus(goal.type, progressAmount, instance.targetAmount, true, instance.status);
        await tx.goalInstance.update({
          where: { id: instance.id },
          data: { periodEnd, progressAmount, status, computedAt: now },
        });
      }

      if (!reused) {
        const periodEnd = goal.isRecurring ? resolvePeriodBounds(today, goal.recurrenceUnit!)[1] : goal.periodEnd!;
        // A fixed goal whose end date passed while it was ended has nothing left to track.
        if (periodEnd >= now) {
          await tx.goalInstance.create({
            data: { goalId: goal.id, periodStart: today, periodEnd, targetAmount: goal.targetAmount },
          });
        }
      }

      return tx.goal.update({ where: { id: goal.id }, data: { archivedAt: null } });
    });
  }

  /**
   * Live progress for the open period, so the card matches the history. An
   * ended goal shows what was frozen when it was ended.
   */
  private async withLiveProgress(goal: Goal & { instances: GoalInstance[] }) {
    const current = goal.instances[0];
    if (!current || goal.archivedAt || !isOpenInstance(current)) return { ...goal, currentInstance: current ?? null };
    return { ...goal, currentInstance: await this.liveInstance(goal, current, new Date()) };
  }

  /**
   * Computes an open instance's progress and status as of `now`.
   *
   * Reach goals (BALANCE/INCOME) keep ACHIEVED for the rest of the period: the
   * first time it's observed it's stored on the instance (status ACHIEVED,
   * `computedAt` inside the period), so a later dip doesn't undo it and the
   * rollover finalizes it as ACHIEVED. Expense caps stay live until the period
   * ends: going over shows FAILED, but nothing is stored, so deleting an
   * expense can bring the goal back under its cap.
   */
  private async liveInstance(goal: Goal, instance: GoalInstance, now: Date): Promise<GoalInstance> {
    const progressAmount = await this.computeProgressAmount(goal, instance.periodStart, instance.periodEnd, now);
    const status = this.evaluateStatus(goal.type, progressAmount, instance.targetAmount, now >= instance.periodEnd, instance.status);
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
    goal: Pick<Goal, 'type' | 'accountId' | 'userId'>,
    periodStart: Date,
    periodEnd: Date,
    now: Date,
  ): Promise<Prisma.Decimal> {
    const boundary = now < periodEnd ? now : periodEnd;

    if (goal.type === GoalType.BALANCE) {
      // Net CREDIT/DEBIT in the database (2-3 grouped rows) instead of pulling
      // every TransactionItem the account has ever had into Node and summing
      // there (audit PERF-XX). userId is included as defence in depth — this
      // query is otherwise safe only because accountId was ownership-checked
      // upstream.
      //
      // Filtered by the transaction's occurredAt (when the money moved), not
      // the ledger row's createdAt (when it was entered) — AnalyticsService's
      // monthly summary already keys off occurredAt, so a back-dated entry
      // (catching up on a receipt from last month) must land in the same
      // period on both surfaces instead of disagreeing (audit DATA-XX).
      //
      // The account's opening balance is the starting point: it's what the
      // account held before its first entry, so it counts at any boundary.
      const [rows, account] = await Promise.all([
        this.prisma.transactionItem.groupBy({
          by: ['direction'],
          where: { userId: goal.userId, accountId: goal.accountId, transaction: { occurredAt: { lte: boundary }, deletedAt: null } },
          _sum: { amount: true },
        }),
        this.prisma.account.findFirst({
          where: { id: goal.accountId, userId: goal.userId },
          select: { openingBalance: true },
        }),
      ]);
      return rows.reduce((sum, row) => {
        const amount = row._sum.amount ?? new Prisma.Decimal(0);
        return row.direction === 'CREDIT' ? sum.plus(amount) : sum.minus(amount);
      }, account?.openingBalance ?? new Prisma.Decimal(0));
    }

    // Matches transactions by their OWN type field, exactly like
    // AnalyticsService.getMonthlySummary does (`if (transaction.type ===
    // TransactionType.INCOME) ...`) — never by the transaction's or an item's
    // *category* type. Category is purely a display/breakdown concern
    // (Category.type is independent of TransactionType); gating inclusion on
    // it excluded every uncategorized transaction from the goal entirely
    // (audit DATA-XX), and ignored that a split item's own category has no
    // bearing on whether the item counts as income/expense — the parent
    // transaction's type already decides that for every one of its items.
    const transactionType = goal.type === GoalType.INCOME ? TransactionType.INCOME : TransactionType.EXPENSE;
    const { _sum } = await this.prisma.transactionItem.aggregate({
      where: {
        userId: goal.userId,
        accountId: goal.accountId,
        transaction: {
          occurredAt: { gte: periodStart, lte: boundary },
          type: transactionType,
          deletedAt: null,
        },
      },
      _sum: { amount: true },
    });
    return _sum.amount ?? new Prisma.Decimal(0);
  }

  /**
   * BALANCE/INCOME are "reach" goals: achieved as soon as progress hits the target and stay
   * achieved even if the balance/income later dips. EXPENSE is a "stay under" goal: it fails the
   * moment spending exceeds the target, and is only achieved once the period ends without that.
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
   * Daily rollover: finalizes instances whose period has ended and opens the next period for
   * recurring goals. Runs at most one period per day, so a goal left uncomputed for a long outage
   * catches up gradually rather than all at once.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async rolloverExpiredInstances() {
    const now = new Date();

    // Ended goals are frozen and skipped. An instance achieved during its
    // period is still open (see `isOpenInstance`) and is finalized here too,
    // recording its end-of-period progress while staying ACHIEVED.
    const expired = await this.prisma.goalInstance.findMany({
      where: {
        periodEnd: { lt: now },
        goal: { archivedAt: null },
        ...openInstancesOf(undefined, this.prisma.goalInstance.fields.periodEnd),
      },
      include: { goal: true },
    });
    for (const instance of expired) {
      const progressAmount = await this.computeProgressAmount(
        instance.goal,
        instance.periodStart,
        instance.periodEnd,
        now,
      );
      const status = this.evaluateStatus(instance.goal.type, progressAmount, instance.targetAmount, true, instance.status);
      await this.prisma.goalInstance.update({
        where: { id: instance.id },
        data: { progressAmount, status, computedAt: now },
      });
    }
    if (expired.length) this.logger.log(`Finalized ${expired.length} expired goal instance(s)`);

    const recurringGoals = await this.prisma.goal.findMany({
      where: { isRecurring: true, archivedAt: null },
      include: { instances: { orderBy: { periodStart: 'desc' }, take: 1 } },
    });
    let created = 0;
    for (const goal of recurringGoals) {
      const latest = goal.instances[0];
      if (latest && latest.periodEnd >= now) continue;

      const anchor = latest ? new Date(latest.periodEnd.getTime() + 1) : goal.periodStart;
      const [periodStart, periodEnd] = resolvePeriodBounds(anchor, goal.recurrenceUnit!);
      await this.prisma.goalInstance.upsert({
        where: { goalId_periodStart: { goalId: goal.id, periodStart } },
        create: { goalId: goal.id, periodStart, periodEnd, targetAmount: goal.targetAmount },
        update: {},
      });
      created += 1;
    }
    if (created) this.logger.log(`Opened ${created} new recurring goal instance(s)`);
  }
}
