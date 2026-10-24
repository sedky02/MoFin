import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lowerBound, upperBoundFilter } from '../../common/utils/date-bounds';
import { PrismaService } from '../../database/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { TRANSACTION_INCLUDE } from '../transactions/transaction-include';
import { SearchTransactionsDto } from './dto/search.dto';

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService
  ) {}

  async searchTransactions(userId: string, query: SearchTransactionsDto) {
    if (query.accountId) await this.accountsService.assertOwned(userId, query.accountId);
    if (query.categoryId) await this.categoriesService.assertAvailable(userId, query.categoryId);

    return this.prisma.paginated.transaction.paginate({
      where: {
        userId,
        deletedAt: null,
        description: { contains: query.q, mode: 'insensitive' },
        // A split files its categories on its lines, an unsplit transaction on itself; match either.
        // OR (not a second `items` key) so it composes with the account/amount filter below.
        ...(query.categoryId
          ? { OR: [{ categoryId: query.categoryId }, { items: { some: { categoryId: query.categoryId } } }] }
          : {}),
        // A date-only `to` covers that whole day (`lt` the next day); a datetime stays an inclusive instant.
        ...(query.from || query.to
          ? {
              occurredAt: {
                ...(query.from ? { gte: lowerBound(query.from) } : {}),
                ...(query.to ? upperBoundFilter(query.to) : {})
              }
            }
          : {}),
        ...(query.accountId || query.minAmount || query.maxAmount
          ? {
              items: {
                some: {
                  ...(query.accountId ? { accountId: query.accountId } : {}),
                  amount: {
                    ...(query.minAmount ? { gte: new Prisma.Decimal(query.minAmount) } : {}),
                    ...(query.maxAmount ? { lte: new Prisma.Decimal(query.maxAmount) } : {})
                  }
                }
              }
            }
          : {})
      },
      include: TRANSACTION_INCLUDE,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      limit: query.limit,
      offset: query.offset
    });
  }
}
