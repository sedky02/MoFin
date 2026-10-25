import { Injectable } from '@nestjs/common';
import { RecurringStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { AccountsService } from '../modules/accounts/accounts.service';
import { CategoriesService } from '../modules/categories/categories.service';
import { GoalsService, resolvePeriodBounds } from '../modules/goals/goals.service';
import { computeNextOccurrence, isPastEndDate, TransactionsService } from '../modules/transactions/transactions.service';
import { UsersService } from '../modules/users/users.service';
import {
  DEMO_DISPLAY_NAME,
  DEMO_EMAIL,
  DemoAccountKey,
  DemoIds,
  DemoPlan,
  DemoRecurringPlan,
  summarizePlan,
  toCreateCommand,
} from './demo-plan';

export interface DemoSeedOptions {
  plan: DemoPlan;
  password: string;
  /** Delete an existing demo account and create it again. */
  reset: boolean;
}

export type DemoSeedResult =
  | { status: 'exists'; userId: string }
  | {
      status: 'created';
      userId: string;
      reset: boolean;
      accounts: number;
      transactions: number;
      goals: number;
      summary: ReturnType<typeof summarizePlan>;
    };

/**
 * Writes a demo plan through the same services the API uses, so every
 * transaction is validated and posted to the ledger exactly like one a user
 * enters: the seed never writes a ledger row itself.
 */
@Injectable()
export class DemoSeeder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly transactionsService: TransactionsService,
    private readonly goalsService: GoalsService,
  ) {}

  async run({ plan, password, reset }: DemoSeedOptions): Promise<DemoSeedResult> {
    const existing = await this.usersService.findByEmail(DEMO_EMAIL);
    if (existing && !reset) return { status: 'exists', userId: existing.id };
    if (existing) await this.usersService.deleteUserData(existing.id);

    // Same cost factor as AuthService, and the same default categories as a
    // registration, since createUser is the path registration takes.
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.usersService.createUser({ email: DEMO_EMAIL, displayName: DEMO_DISPLAY_NAME, passwordHash });

    try {
      const ids = await this.createAccountsAndCategories(user.id, plan);
      for (const transaction of plan.transactions) {
        await this.transactionsService.create(user.id, toCreateCommand(transaction, ids));
      }
      let occurrences = 0;
      for (const series of plan.recurring) occurrences += await this.createSeries(user.id, series, ids);
      for (const goal of plan.goals) {
        const created = await this.goalsService.create(user.id, {
          accountId: ids.accounts[goal.account],
          name: goal.name,
          type: goal.type,
          targetAmount: goal.targetAmount,
          isRecurring: goal.isRecurring,
          recurrenceUnit: goal.recurrenceUnit,
          periodStart: goal.periodStart,
          periodEnd: goal.periodEnd,
        });
        if (created.isRecurring) await this.closePastPeriods(created.id, plan.now);
      }

      return {
        status: 'created',
        userId: user.id,
        reset: Boolean(existing),
        accounts: plan.accounts.length,
        transactions: plan.transactions.length + plan.recurring.length + occurrences,
        goals: plan.goals.length,
        summary: summarizePlan(plan),
      };
    } catch (error) {
      // A half-written demo would read as "already exists" on the next run.
      await this.usersService.deleteUserData(user.id);
      throw error;
    }
  }

  private async createAccountsAndCategories(userId: string, plan: DemoPlan): Promise<DemoIds> {
    const accounts = {} as Record<DemoAccountKey, string>;
    for (const account of plan.accounts) {
      const created = await this.accountsService.create(userId, {
        name: account.name,
        type: account.type,
        currency: account.currency,
        openingBalance: account.openingBalance,
      });
      accounts[account.key] = created.id;
    }

    for (const category of plan.extraCategories) await this.categoriesService.create(userId, category);
    const categories: Record<string, string> = {};
    for (const category of await this.prisma.category.findMany({ where: { userId } })) {
      categories[category.name] = category.id;
    }
    return { accounts, categories };
  }

  /**
   * Creates the series' root, then posts each occurrence and moves the
   * series' cursor in one transaction, the way RecurringTransactionsCron does,
   * so the series looks exactly like one the nightly job has been running.
   */
  private async createSeries(userId: string, series: DemoRecurringPlan, ids: DemoIds): Promise<number> {
    const root = await this.transactionsService.create(userId, {
      ...toCreateCommand(series.root, ids),
      isRecurring: true,
      recurringInterval: series.interval,
    });
    const anchorDay = root.occurredAt.getUTCDate();

    for (const occurredAt of series.occurrences) {
      await this.prisma.$transaction(async (db) => {
        await this.transactionsService.create(
          userId,
          { ...toCreateCommand({ ...series.root, occurredAt }, ids), parentTransactionId: root.id },
          db,
        );
        const next = computeNextOccurrence(anchorDay, occurredAt, series.interval);
        await db.transaction.update({
          where: { id: root.id },
          data: isPastEndDate(next, root.recurringEndDate)
            ? { recurringStatus: RecurringStatus.CANCELLED, nextOccurrenceAt: null }
            : { nextOccurrenceAt: next },
        });
      });
    }
    return series.occurrences.length;
  }

  /**
   * Judges and closes a recurring goal's periods that ended before `now` and
   * opens the next one, as GoalsService.rolloverExpiredInstances does one
   * period a night. Done here for this goal only, so the demo opens with its
   * history filled in without touching anyone else's goals.
   */
  private async closePastPeriods(goalId: string, now: Date): Promise<void> {
    for (;;) {
      const goal = await this.prisma.goal.findUniqueOrThrow({
        where: { id: goalId },
        include: { instances: { orderBy: { periodStart: 'desc' }, take: 1 } },
      });
      const latest = goal.instances[0];
      if (!latest || latest.periodEnd >= now) return;

      const progressAmount = await this.goalsService.computeProgressAmount(goal, latest.periodStart, latest.periodEnd, now);
      const status = this.goalsService.evaluateStatus(goal.type, progressAmount, latest.targetAmount, true, latest.status);
      await this.prisma.goalInstance.update({
        where: { id: latest.id },
        data: { progressAmount, status, computedAt: now },
      });
      const [periodStart, periodEnd] = resolvePeriodBounds(new Date(latest.periodEnd.getTime() + 1), goal.recurrenceUnit!);
      await this.prisma.goalInstance.create({
        data: { goalId, periodStart, periodEnd, targetAmount: goal.targetAmount },
      });
    }
  }
}
