import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lowerBound, upperBoundFilter } from '../../common/utils/date-bounds';
import { PrismaService } from '../../database/prisma.service';
import { AccountAccessService } from '../account-access/account-access.service';
import { CategoriesService } from '../categories/categories.service';
import { TRANSACTION_INCLUDE } from '../transactions/transaction-include';
import {
  accountIdsOf,
  presentTransaction,
} from '../transactions/transaction-view';
import { SearchTransactionsDto } from './dto/search.dto';

type LoadedTransaction = Prisma.TransactionGetPayload<{
  include: typeof TRANSACTION_INCLUDE;
}>;

type SearchSort = NonNullable<SearchTransactionsDto['sort']>;

// Newest first unless asked otherwise. The amount sorts fall back to newest
// first between equal totals (see searchByAmount).
const DATE_ORDER = {
  newest: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
  oldest: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
} satisfies Record<
  'newest' | 'oldest',
  Prisma.TransactionOrderByWithRelationInput[]
>;

// What a series list wants first: active series (the enum sorts in declaration
// order: ACTIVE, PAUSED, CANCELLED), the soonest next occurrence first. Rows
// outside any series carry neither field and come last, newest first.
const NEXT_OCCURRENCE_ORDER = [
  { recurringStatus: { sort: 'asc', nulls: 'last' } },
  { nextOccurrenceAt: { sort: 'asc', nulls: 'last' } },
  ...DATE_ORDER.newest,
] satisfies Prisma.TransactionOrderByWithRelationInput[];

function orderFor(
  sort: SearchSort | undefined,
): Prisma.TransactionOrderByWithRelationInput[] {
  if (sort === 'next-occurrence') return NEXT_OCCURRENCE_ORDER;
  return DATE_ORDER[sort === 'oldest' ? 'oldest' : 'newest'];
}

/**
 * A transaction's total from its ledger legs: what left an account (expense,
 * transfer) or came into one (income). A transfer's two legs carry the same
 * amount, so the larger side is the total for every type.
 */
export function transactionTotal(
  items: { direction: string; amount: Prisma.Decimal }[],
): Prisma.Decimal {
  let debit = new Prisma.Decimal(0);
  let credit = new Prisma.Decimal(0);
  for (const item of items) {
    if (item.direction === 'DEBIT') debit = debit.plus(item.amount);
    else credit = credit.plus(item.amount);
  }
  return Prisma.Decimal.max(debit, credit);
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccountAccessService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async searchTransactions(userId: string, query: SearchTransactionsDto) {
    if (query.accountId)
      await this.access.assertAccess(userId, query.accountId, 'view');
    if (query.categoryId)
      await this.categoriesService.assertReadable(userId, query.categoryId);
    const accountIds = query.accountId
      ? [query.accountId]
      : await this.access.accessibleAccountIds(userId, 'view');

    // The amount bounds apply to a transaction's total, like the amount sort,
    // so a 100 split into 60 + 40 matches "at least 80".
    const idsInAmountRange =
      query.minAmount || query.maxAmount
        ? await this.idsWithTotalBetween(
            accountIds,
            query.minAmount,
            query.maxAmount,
          )
        : null;

    const args = {
      where: {
        deletedAt: null,
        items: { some: { accountId: { in: accountIds } } },
        ...(idsInAmountRange ? { id: { in: idsInAmountRange } } : {}),
        description: { contains: query.q, mode: 'insensitive' },
        // A split files its categories on its lines, an unsplit transaction on itself; match either.
        // OR (not a second `items` key) so it composes with the account/amount filter below.
        ...(query.categoryId
          ? {
              OR: [
                { categoryId: query.categoryId },
                { items: { some: { categoryId: query.categoryId } } },
              ],
            }
          : {}),
        // A date-only `to` covers that whole day (`lt` the next day); a datetime stays an inclusive instant.
        ...(query.from || query.to
          ? {
              occurredAt: {
                ...(query.from ? { gte: lowerBound(query.from) } : {}),
                ...(query.to ? upperBoundFilter(query.to) : {}),
              },
            }
          : {}),
        ...(query.type ? { type: query.type } : {}),
        // Under AND so it composes with the category OR above.
        ...(query.recurrence === 'recurring'
          ? {
              AND: [
                {
                  OR: [
                    { isRecurring: true },
                    { parentTransactionId: { not: null } },
                  ],
                },
              ],
            }
          : {}),
        ...(query.recurrence === 'one-off'
          ? { isRecurring: false, parentTransactionId: null }
          : {}),
        // Only a root carries the series template (schedule, amount, status).
        ...(query.recurrence === 'series'
          ? { isRecurring: true, parentTransactionId: null }
          : {}),
      },
      include: TRANSACTION_INCLUDE,
      orderBy: orderFor(query.sort),
      limit: query.limit,
      offset: query.offset,
    } satisfies Prisma.TransactionFindManyArgs & {
      limit: number;
      offset: number;
    };

    if (query.sort === 'amount-desc' || query.sort === 'amount-asc') {
      return this.searchByAmount(
        userId,
        args.where,
        query.sort,
        query.limit,
        query.offset,
      );
    }
    const page = await this.prisma.paginated.transaction.paginate(args);
    return {
      ...page,
      data: await this.present(userId, page.data),
    };
  }

  /** Hides what the caller can't reach: a transfer's leg on someone's private account. */
  private async present(userId: string, rows: LoadedTransaction[]) {
    const roles = await this.access.rolesOn(userId, [
      ...new Set(rows.flatMap(accountIdsOf)),
    ]);
    return rows.map((row) => presentTransaction(row, roles));
  }

  /**
   * Ids of the live transactions on these accounts whose total (see transactionTotal) lies
   * within the bounds. Prisma can't filter on a sum of related rows, so the
   * totals are computed in the database.
   */
  private async idsWithTotalBetween(
    accountIds: string[],
    min: string | undefined,
    max: string | undefined,
  ): Promise<string[]> {
    const total = Prisma.sql`GREATEST(
      COALESCE(SUM(CASE WHEN ti.direction = 'DEBIT' THEN ti.amount END), 0),
      COALESCE(SUM(CASE WHEN ti.direction = 'CREDIT' THEN ti.amount END), 0)
    )`;
    const bounds = [
      ...(min ? [Prisma.sql`${total} >= ${min}::numeric`] : []),
      ...(max ? [Prisma.sql`${total} <= ${max}::numeric`] : []),
    ];
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT ti."transactionId" AS id
      FROM "TransactionItem" ti
      JOIN "Transaction" t ON t.id = ti."transactionId"
      WHERE ti."accountId" = ANY(${accountIds}::text[]) AND t."deletedAt" IS NULL
      GROUP BY ti."transactionId"
      HAVING ${Prisma.join(bounds, ' AND ')}
    `);
    return rows.map((row) => row.id);
  }

  /**
   * A transaction's total is the sum of its ledger legs, which Prisma can't
   * order by, so the matches are ranked here: every match's legs are read
   * (amounts only), sorted, and just the requested page is loaded in full.
   * Fine at one person's transaction volume; a raw SQL ranking is the next
   * step if it ever isn't.
   */
  private async searchByAmount(
    userId: string,
    where: Prisma.TransactionWhereInput,
    sort: Extract<SearchSort, 'amount-desc' | 'amount-asc'>,
    limit: number,
    offset: number,
  ) {
    const matches = await this.prisma.transaction.findMany({
      where,
      select: {
        id: true,
        occurredAt: true,
        createdAt: true,
        items: { select: { direction: true, amount: true } },
      },
    });
    const sign = sort === 'amount-desc' ? -1 : 1;
    const ranked = matches
      .map((tx) => ({ ...tx, total: transactionTotal(tx.items) }))
      .sort(
        (a, b) =>
          sign * a.total.comparedTo(b.total) ||
          b.occurredAt.getTime() - a.occurredAt.getTime() ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );

    const pageIds = ranked.slice(offset, offset + limit).map((tx) => tx.id);
    const rows = await this.prisma.transaction.findMany({
      where: { id: { in: pageIds } },
      include: TRANSACTION_INCLUDE,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const data = await this.present(
      userId,
      pageIds.flatMap((id) => byId.get(id) ?? []),
    );
    return { data, total: ranked.length, limit, offset };
  }
}
