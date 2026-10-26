import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lowerBound, upperBoundFilter } from '../../common/utils/date-bounds';
import { PrismaService } from '../../database/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { TRANSACTION_INCLUDE } from '../transactions/transaction-include';
import { SearchTransactionsDto } from './dto/search.dto';

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
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async searchTransactions(userId: string, query: SearchTransactionsDto) {
    if (query.accountId)
      await this.accountsService.assertOwned(userId, query.accountId);
    if (query.categoryId)
      await this.categoriesService.assertAvailable(userId, query.categoryId);

    const args = {
      where: {
        userId,
        deletedAt: null,
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
        ...(query.accountId || query.minAmount || query.maxAmount
          ? {
              items: {
                some: {
                  ...(query.accountId ? { accountId: query.accountId } : {}),
                  amount: {
                    ...(query.minAmount
                      ? { gte: new Prisma.Decimal(query.minAmount) }
                      : {}),
                    ...(query.maxAmount
                      ? { lte: new Prisma.Decimal(query.maxAmount) }
                      : {}),
                  },
                },
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
        args.where,
        query.sort,
        query.limit,
        query.offset,
      );
    }
    return this.prisma.paginated.transaction.paginate(args);
  }

  /**
   * A transaction's total is the sum of its ledger legs, which Prisma can't
   * order by, so the matches are ranked here: every match's legs are read
   * (amounts only), sorted, and just the requested page is loaded in full.
   * Fine at one person's transaction volume; a raw SQL ranking is the next
   * step if it ever isn't.
   */
  private async searchByAmount(
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
    const data = pageIds.flatMap((id) => byId.get(id) ?? []);
    return { data, total: ranked.length, limit, offset };
  }
}
