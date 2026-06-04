import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
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

    return this.prisma.transaction.findMany({
      where: {
        userId,
        description: { contains: query.q, mode: 'insensitive' },
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.from || query.to ? { occurredAt: { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } } : {}),
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
      include: { items: true, category: true },
      orderBy: { occurredAt: 'desc' },
      take: 50
    });
  }
}
