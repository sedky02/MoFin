import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Goal, GoalInstance, GoalRecurrenceUnit, GoalStatus, GoalType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CreateGoalDto, ListGoalsQueryDto, UpdateGoalDto } from './dto/goals.dto';

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}
function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}
function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

/** Resolves the calendar-aligned [start, end] bounds of the period containing `anchor`. */
function resolvePeriodBounds(anchor: Date, unit: GoalRecurrenceUnit): [Date, Date] {
  return unit === GoalRecurrenceUnit.MONTH
    ? [startOfMonth(anchor), endOfMonth(anchor)]
    : [startOfYear(anchor), endOfYear(anchor)];
}

@Injectable()
export class GoalsService {
  private readonly logger = new Logger(GoalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
  ) {}

  async create(userId: string, dto: CreateGoalDto) {
    const account = await this.accountsService.assertOwned(userId, dto.accountId);

    let periodStart: Date;
    let periodEnd: Date;
    if (dto.isRecurring) {
      [periodStart, periodEnd] = resolvePeriodBounds(new Date(dto.periodStart), dto.recurrenceUnit!);
    } else {
      periodStart = new Date(dto.periodStart);
      periodEnd = new Date(dto.periodEnd!);
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

  async list(userId: string, status: ListGoalsQueryDto['status'] = 'active') {
    const archivedFilter =
      status === 'active' ? { archivedAt: null } : status === 'archived' ? { archivedAt: { not: null } } : {};
    const goals = await this.prisma.goal.findMany({
      where: { userId, ...archivedFilter },
      orderBy: { createdAt: 'desc' },
      include: { instances: { orderBy: { periodStart: 'desc' }, take: 1 } },
    });
    return Promise.all(goals.map((goal) => this.withLiveProgress(goal)));
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

  async history(userId: string, goalId: string) {
    await this.assertOwned(userId, goalId);
    return this.prisma.goalInstance.findMany({ where: { goalId }, orderBy: { periodStart: 'desc' } });
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
        await tx.goalInstance.updateMany({
          where: { goalId: goal.id, status: GoalStatus.IN_PROGRESS },
          data: { targetAmount },
        });
      }
      return updated;
    });
  }

  async archive(userId: string, goalId: string) {
    const goal = await this.assertOwned(userId, goalId);
    return this.prisma.goal.update({ where: { id: goal.id }, data: { archivedAt: new Date() } });
  }

  /** Recomputes the live progress/status of a goal's current open instance without persisting it. */
  private async withLiveProgress(goal: Goal & { instances: GoalInstance[] }) {
    const current = goal.instances[0];
    if (!current || current.status !== GoalStatus.IN_PROGRESS) return { ...goal, currentInstance: current ?? null };

    const now = new Date();
    const progressAmount = await this.computeProgressAmount(goal, current.periodStart, current.periodEnd, now);
    const status = this.evaluateStatus(goal.type, progressAmount, current.targetAmount, now >= current.periodEnd, current.status);
    return { ...goal, currentInstance: { ...current, progressAmount, status, computedAt: now } };
  }

  async computeProgressAmount(
    goal: Pick<Goal, 'type' | 'accountId'>,
    periodStart: Date,
    periodEnd: Date,
    now: Date,
  ): Promise<Prisma.Decimal> {
    const boundary = now < periodEnd ? now : periodEnd;

    if (goal.type === GoalType.BALANCE) {
      const items = await this.prisma.transactionItem.findMany({
        where: { accountId: goal.accountId, createdAt: { lte: boundary } },
      });
      return items.reduce(
        (sum, item) => (item.direction === 'CREDIT' ? sum.plus(item.amount) : sum.minus(item.amount)),
        new Prisma.Decimal(0),
      );
    }

    const categoryType = goal.type === GoalType.INCOME ? 'INCOME' : 'EXPENSE';
    const items = await this.prisma.transactionItem.findMany({
      where: {
        accountId: goal.accountId,
        createdAt: { gte: periodStart, lte: boundary },
        transaction: { category: { type: categoryType } },
      },
    });
    return items.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
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

    const expired = await this.prisma.goalInstance.findMany({
      where: { periodEnd: { lt: now }, status: GoalStatus.IN_PROGRESS },
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
