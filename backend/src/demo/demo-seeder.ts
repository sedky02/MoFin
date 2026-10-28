import { Injectable } from '@nestjs/common';
import { Prisma, RecurringStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { AccountsService } from '../modules/accounts/accounts.service';
import { CategoriesService } from '../modules/categories/categories.service';
import {
  GoalsService,
  resolvePeriodBounds,
} from '../modules/goals/goals.service';
import {
  computeNextOccurrence,
  isPastEndDate,
} from '../modules/transactions/recurrence';
import { TransactionsService } from '../modules/transactions/transactions.service';
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

type Db = Prisma.TransactionClient;

/**
 * A seed is a few hundred writes, so its transaction gets more room than
 * Prisma's 5s default. Shared with the per-visitor demo, which seeds the same way.
 */
export const SEED_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

export interface SeededCounts {
  accounts: number;
  transactions: number;
  goals: number;
}

export interface DemoSeedOptions {
  plan: DemoPlan;
  password: string;
  /** Delete an existing demo account and create it again. */
  reset: boolean;
}

export type DemoSeedResult =
  | { status: 'exists'; userId: string }
  | ({
      status: 'created';
      userId: string;
      reset: boolean;
      summary: ReturnType<typeof summarizePlan>;
    } & SeededCounts);

/**
 * Writes a demo plan through the same services the API uses, so every
 * transaction is validated and posted to the ledger exactly like one a user
 * enters: the seed never writes a ledger row itself.
 *
 * `seedUserData` is the one place the sample data is written. The demo account
 * (`run`, from prisma/seed.ts) and each visitor's temporary demo user both go
 * through it, inside a transaction that also creates the user, so a failure
 * leaves nothing behind.
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

  async run({
    plan,
    password,
    reset,
  }: DemoSeedOptions): Promise<DemoSeedResult> {
    const existing = await this.usersService.findByEmail(DEMO_EMAIL);
    if (existing && !reset) return { status: 'exists', userId: existing.id };
    if (existing) await this.usersService.deleteUserData(existing.id);

    // Same cost factor as AuthService, and the same default categories as a
    // registration, since createUser is the path registration takes. Hashed
    // before the transaction opens, so the slow part doesn't hold it.
    const passwordHash = await bcrypt.hash(password, 12);
    const { userId, counts } = await this.prisma.$transaction(async (tx) => {
      const user = await this.usersService.createUser(
        { email: DEMO_EMAIL, displayName: DEMO_DISPLAY_NAME, passwordHash },
        tx,
      );
      return {
        userId: user.id,
        counts: await this.seedUserData(tx, user.id, plan),
      };
    }, SEED_TRANSACTION_OPTIONS);

    return {
      status: 'created',
      userId,
      reset: Boolean(existing),
      ...counts,
      summary: summarizePlan(plan),
    };
  }

  /**
   * Fills a freshly created user with the plan's accounts, categories,
   * transactions, recurring series and goals, all through `tx`. The caller owns
   * the transaction (and creates the user in it).
   *
   * TransactionsService doesn't emit TransactionCreated for writes made in a
   * caller's transaction; the only listener clears the analytics cache, and a
   * new user has none yet.
   */
  async seedUserData(
    tx: Db,
    userId: string,
    plan: DemoPlan,
  ): Promise<SeededCounts> {
    const ids = await this.createAccountsAndCategories(tx, userId, plan);
    for (const transaction of plan.transactions) {
      await this.transactionsService.create(
        userId,
        toCreateCommand(transaction, ids),
        tx,
      );
    }
    let occurrences = 0;
    for (const series of plan.recurring)
      occurrences += await this.createSeries(tx, userId, series, ids);
    for (const goal of plan.goals) {
      const created = await this.goalsService.create(
        userId,
        {
          accountId: ids.accounts[goal.account],
          name: goal.name,
          type: goal.type,
          targetAmount: goal.targetAmount,
          isRecurring: goal.isRecurring,
          recurrenceUnit: goal.recurrenceUnit,
          periodStart: goal.periodStart,
          periodEnd: goal.periodEnd,
        },
        tx,
      );
      if (created.isRecurring)
        await this.closePastPeriods(tx, created.id, plan.now);
    }

    return {
      accounts: plan.accounts.length,
      transactions:
        plan.transactions.length + plan.recurring.length + occurrences,
      goals: plan.goals.length,
    };
  }

  private async createAccountsAndCategories(
    tx: Db,
    userId: string,
    plan: DemoPlan,
  ): Promise<DemoIds> {
    const accounts = {} as Record<DemoAccountKey, string>;
    for (const account of plan.accounts) {
      const created = await this.accountsService.create(
        userId,
        {
          name: account.name,
          type: account.type,
          currency: account.currency,
          openingBalance: account.openingBalance,
        },
        tx,
      );
      accounts[account.key] = created.id;
    }

    for (const category of plan.extraCategories)
      await this.categoriesService.create(userId, category, tx);
    const categories: Record<string, string> = {};
    for (const category of await tx.category.findMany({
      where: { userId },
    })) {
      categories[category.name] = category.id;
    }
    return { accounts, categories };
  }

  /**
   * Creates the series' root, then posts each occurrence and moves the
   * series' cursor, the way RecurringTransactionsCron does, so the series
   * looks exactly like one the nightly job has been running.
   */
  private async createSeries(
    tx: Db,
    userId: string,
    series: DemoRecurringPlan,
    ids: DemoIds,
  ): Promise<number> {
    const root = await this.transactionsService.create(
      userId,
      {
        ...toCreateCommand(series.root, ids),
        isRecurring: true,
        recurringInterval: series.interval,
      },
      tx,
    );
    const anchorDay = root.occurredAt.getUTCDate();

    for (const occurredAt of series.occurrences) {
      await this.transactionsService.create(
        userId,
        {
          ...toCreateCommand({ ...series.root, occurredAt }, ids),
          parentTransactionId: root.id,
        },
        tx,
      );
      const next = computeNextOccurrence(
        anchorDay,
        occurredAt,
        series.interval,
      );
      await tx.transaction.update({
        where: { id: root.id },
        data: isPastEndDate(next, root.recurringEndDate)
          ? {
              recurringStatus: RecurringStatus.CANCELLED,
              nextOccurrenceAt: null,
            }
          : { nextOccurrenceAt: next },
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
  private async closePastPeriods(
    tx: Db,
    goalId: string,
    now: Date,
  ): Promise<void> {
    for (;;) {
      const goal = await tx.goal.findUniqueOrThrow({
        where: { id: goalId },
        include: { instances: { orderBy: { periodStart: 'desc' }, take: 1 } },
      });
      const latest = goal.instances[0];
      if (!latest || latest.periodEnd >= now) return;

      const progressAmount = await this.goalsService.computeProgressAmount(
        goal,
        latest.periodStart,
        latest.periodEnd,
        now,
        tx,
      );
      const status = this.goalsService.evaluateStatus(
        goal.type,
        progressAmount,
        latest.targetAmount,
        true,
        latest.status,
      );
      await tx.goalInstance.update({
        where: { id: latest.id },
        data: { progressAmount, status, computedAt: now },
      });
      const [periodStart, periodEnd] = resolvePeriodBounds(
        new Date(latest.periodEnd.getTime() + 1),
        goal.recurrenceUnit!,
      );
      await tx.goalInstance.create({
        data: {
          goalId,
          periodStart,
          periodEnd,
          targetAmount: goal.targetAmount,
        },
      });
    }
  }
}
