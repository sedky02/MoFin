import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { accountScope } from '../account-access/account-access';
import { AccountAccessService } from '../account-access/account-access.service';
import {
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './dto/categories.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccountAccessService,
  ) {}

  /**
   * `isSystem` is derived from `userId === null`, so the frontend can tell global categories (not
   * editable) from the caller's own without seeing a raw `userId`.
   */
  private toResponse<T extends { userId: string | null }>(
    category: T,
  ): T & { isSystem: boolean } {
    return { ...category, isSystem: category.userId === null };
  }

  async create(
    userId: string,
    dto: CreateCategoryDto,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    try {
      const category = await db.category.create({
        data: { ...dto, userId },
      });
      return this.toResponse(category);
    } catch (err) {
      // The name is unique per user and type, archived categories included, so
      // point at the archived one instead of a bare "already exists".
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const archived = await db.category.findFirst({
          where: {
            userId,
            name: dto.name,
            type: dto.type,
            archivedAt: { not: null },
          },
        });
        if (archived) {
          throw new ConflictException(
            `"${dto.name}" is archived. Restore it from your archived categories instead.`,
          );
        }
      }
      throw err;
    }
  }

  /** With `accountId`, the owner's categories: a shared account's transactions all use one set. */
  async list(userId: string, query: ListCategoriesQueryDto) {
    const ownerId = query.accountId
      ? (await this.access.assertAccess(userId, query.accountId, 'view'))
          .account.userId
      : userId;
    const archivedFilter =
      query.status === 'active'
        ? { archivedAt: null }
        : query.status === 'archived'
          ? { archivedAt: { not: null } }
          : {};
    const page = await this.prisma.paginated.category.paginate({
      where: {
        OR: [{ userId: ownerId }, { userId: null }],
        ...archivedFilter,
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      limit: query.limit,
      offset: query.offset,
    });
    return {
      ...page,
      data: page.data.map((category) => this.toResponse(category)),
    };
  }

  listForOwners(ownerIds: string[], limit: number) {
    return this.prisma.category.findMany({
      where: {
        OR: [{ userId: { in: ownerIds } }, { userId: null }],
        archivedAt: null,
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      take: limit,
    });
  }

  /**
   * For filtering what `userId` can read: their own, a global one, or one that
   * belongs to the owner of an account they can reach.
   */
  async assertReadable(userId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        OR: [
          { userId },
          { userId: null },
          { user: { accounts: { some: accountScope(userId, 'view') } } },
        ],
      },
    });
    if (!category)
      throw new NotFoundException(`Category ${categoryId} not found`);
    return category;
  }

  /**
   * Archived categories pass: they stay on existing transactions, so editing or searching by them
   * must keep working.
   */
  async assertAvailable(
    userId: string,
    categoryId?: string | null,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    if (!categoryId) return null;
    const category = await db.category.findFirst({
      where: { id: categoryId, OR: [{ userId }, { userId: null }] },
    });
    if (!category)
      throw new NotFoundException(`Category ${categoryId} not found`);
    return category;
  }

  /**
   * Adds a type check: an income filed under an expense category (stale categoryId after a type
   * switch) skewed breakdowns. Transfers take no category.
   */
  async assertAssignable(
    userId: string,
    transactionType: TransactionType,
    categoryId?: string | null,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    if (!categoryId) return null;
    if (transactionType === TransactionType.TRANSFER) {
      throw new BadRequestException('Transfers cannot have a category');
    }
    const category = await this.assertAvailable(userId, categoryId, db);
    if (category && category.type !== transactionType) {
      throw new BadRequestException(
        `"${category.name}" is an ${category.type.toLowerCase()} category and cannot be used on an ${transactionType.toLowerCase()} transaction`,
      );
    }
    return category;
  }

  private async assertOwned(userId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
    });
    if (!category)
      throw new NotFoundException(`Category ${categoryId} not found`);
    return category;
  }

  async update(userId: string, categoryId: string, dto: UpdateCategoryDto) {
    await this.assertOwned(userId, categoryId);
    const updated = await this.prisma.category.update({
      where: { id: categoryId },
      data: dto,
    });
    return this.toResponse(updated);
  }

  /**
   * Live transactions that use the category (on the transaction or a split line, each counted once)
   * and budgets. Deleted transactions don't count.
   */
  async usage(userId: string, categoryId: string) {
    await this.assertOwned(userId, categoryId);
    return this.countUsage(categoryId);
  }

  private async countUsage(categoryId: string) {
    const [transactions, budgets] = await Promise.all([
      this.prisma.transaction.count({
        where: {
          deletedAt: null,
          OR: [{ categoryId }, { items: { some: { categoryId } } }],
        },
      }),
      this.prisma.budget.count({ where: { categoryId } }),
    ]);
    return { transactions, budgets };
  }

  async archive(userId: string, categoryId: string) {
    const category = await this.assertOwned(userId, categoryId);
    if (category.archivedAt) return this.toResponse(category);
    const archived = await this.prisma.category.update({
      where: { id: categoryId },
      data: { archivedAt: new Date() },
    });
    return this.toResponse(archived);
  }

  async restore(userId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId, archivedAt: { not: null } },
    });
    if (!category)
      throw new NotFoundException(`Archived category ${categoryId} not found`);
    const restored = await this.prisma.category.update({
      where: { id: categoryId },
      data: { archivedAt: null },
    });
    return this.toResponse(restored);
  }

  async remove(userId: string, categoryId: string) {
    await this.assertOwned(userId, categoryId);

    const { transactions, budgets } = await this.countUsage(categoryId);
    if (transactions > 0 || budgets > 0) {
      throw new ConflictException(
        'This category is used by existing transactions or budgets and cannot be deleted. Archive it instead.',
      );
    }

    await this.prisma.category.delete({ where: { id: categoryId } });
  }
}
