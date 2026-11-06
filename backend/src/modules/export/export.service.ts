import { Injectable, NotFoundException } from '@nestjs/common';
import { LedgerDirection, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { accountScope } from '../account-access/account-access';
import { AccountAccessService } from '../account-access/account-access.service';
import { ExportFormat } from './dto/export.dto';
import { csvText, toCsv } from './export.csv';

/**
 * Exact text of a Decimal: never through Number (rounds), and toFixed() keeps every digit without
 * exponent notation.
 */
export function money(value: Prisma.Decimal): string {
  return value.toFixed();
}

function nullableMoney(value: Prisma.Decimal | null): string | null {
  return value === null ? null : money(value);
}

function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export const CSV_HEADER = [
  'Date',
  'Description',
  'Type',
  'Account',
  'Category',
  'Amount',
  'Currency',
  'Transaction ID',
] as const;

export interface ExportFile {
  filename: string;
  contentType: string;
  body: string;
}

type ExportRows = Awaited<ReturnType<ExportService['load']>>;

/**
 * Everything the user can read, filtered to accounts they reach so a private leg of a transfer
 * stays out. Rows are mapped field by field so internal columns never leak.
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccountAccessService,
  ) {}

  async export(
    userId: string,
    format: ExportFormat,
    now = new Date(),
  ): Promise<ExportFile> {
    const rows = await this.load(userId);
    const filename = `mofin-export-${now.toISOString().slice(0, 10)}.${format}`;
    if (format === 'csv') {
      return {
        filename,
        contentType: 'text/csv; charset=utf-8',
        body: this.toCsv(rows),
      };
    }
    return {
      filename,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(this.toJson(rows, now), null, 2),
    };
  }

  async load(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const accountIds = await this.access.accessibleAccountIds(userId, 'view');
    const onMyAccounts = { accountId: { in: accountIds } };

    const [accounts, categories, transactions, goals] = await Promise.all([
      this.prisma.account.findMany({
        where: accountScope(userId, 'view'),
        orderBy: { createdAt: 'asc' },
        include: { members: { where: { userId }, select: { role: true } } },
      }),
      this.prisma.category.findMany({
        where: {
          OR: [
            { userId },
            { userId: null },
            { user: { accounts: { some: accountScope(userId, 'view') } } },
          ],
        },
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.transaction.findMany({
        where: { deletedAt: null, items: { some: onMyAccounts } },
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
        include: {
          category: { select: { name: true } },
          items: {
            where: onMyAccounts,
            orderBy: { createdAt: 'asc' },
            include: {
              account: { select: { name: true } },
              category: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.goal.findMany({
        where: onMyAccounts,
        orderBy: { createdAt: 'asc' },
        include: { instances: { orderBy: { periodStart: 'asc' } } },
      }),
    ]);

    return { user, accounts, categories, transactions, goals };
  }

  toJson(
    { user, accounts, categories, transactions, goals }: ExportRows,
    now: Date,
  ) {
    const reachable = new Set(accounts.map((a) => a.id));
    const known = (id: string | null) =>
      id !== null && reachable.has(id) ? id : null;
    return {
      exportedAt: now.toISOString(),
      user: { email: user.email, displayName: user.displayName },
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        role: a.members[0]?.role ?? 'OWNER',
        openingBalance: money(a.openingBalance),
        archivedAt: iso(a.archivedAt),
        createdAt: iso(a.createdAt),
      })),
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        color: c.color,
        icon: c.icon,
        isSystem: c.userId === null,
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        description: t.description,
        currency: t.currency,
        occurredAt: iso(t.occurredAt),
        categoryId: t.categoryId,
        categoryName: t.category?.name ?? null,
        items: t.items.map((i) => ({
          id: i.id,
          accountId: i.accountId,
          accountName: i.account.name,
          categoryId: i.categoryId,
          categoryName: i.category?.name ?? null,
          direction: i.direction,
          amount: money(i.amount),
          currency: i.currency,
          memo: i.memo,
        })),
        isRecurring: t.isRecurring,
        recurringInterval: t.recurringInterval,
        recurringStatus: t.recurringStatus,
        recurringEndDate: iso(t.recurringEndDate),
        nextOccurrenceAt: iso(t.nextOccurrenceAt),
        recurringAmount: nullableMoney(t.recurringAmount),
        recurringFromAccountId: known(t.recurringFromAccountId),
        recurringToAccountId: known(t.recurringToAccountId),
        parentTransactionId: t.parentTransactionId,
        createdAt: iso(t.createdAt),
      })),
      goals: goals.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        accountId: g.accountId,
        targetAmount: money(g.targetAmount),
        isRecurring: g.isRecurring,
        recurrenceUnit: g.recurrenceUnit,
        periodStart: iso(g.periodStart),
        periodEnd: iso(g.periodEnd),
        archivedAt: iso(g.archivedAt),
        createdAt: iso(g.createdAt),
        instances: g.instances.map((gi) => ({
          periodStart: iso(gi.periodStart),
          periodEnd: iso(gi.periodEnd),
          targetAmount: money(gi.targetAmount),
          progressAmount: money(gi.progressAmount),
          status: gi.status,
        })),
      })),
    };
  }

  /**
   * One row per ledger line (a transfer is two). Amounts are signed from the account's side, so
   * opening balance plus the rows gives its balance.
   */
  toCsv({ transactions }: ExportRows): string {
    const rows = transactions.flatMap((t) =>
      t.items.map((i) => [
        iso(t.occurredAt)!,
        csvText(t.description),
        t.type,
        csvText(i.account.name),
        csvText(i.category?.name ?? t.category?.name ?? ''),
        money(
          i.direction === LedgerDirection.DEBIT ? i.amount.negated() : i.amount,
        ),
        i.currency,
        t.id,
      ]),
    );
    return toCsv(CSV_HEADER, rows);
  }
}
