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
   * `isSystem` isn't a stored column — it's derived from `userId === null`
   * (a global/shared category has no owner) and computed here so the
   * frontend can tell global categories apart from the caller's own without
   * ever seeing a raw `userId`. Previously this was never included in API
   * responses at all, so the frontend's `isSystem` filtering always saw
   * `undefined` and rendered every category (global ones included) with
   * live edit/delete buttons that then 404'd against `update`/`remove`'s
   * ownership check (audit DATA-XX).
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

  /**
   * The categories of `userId`, or with `accountId` the ones that fit that
   * account: its owner's, because a shared account's transactions all use one set.
   */
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

  /** Active categories of these people plus the global ones, for assistants choosing among several ledgers. */
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
   * Archived categories pass: they stay on the transactions that already use
   * them, so editing one of those transactions, or searching by the category,
   * must keep working. Archiving only takes them out of the pickers.
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
   * `assertAvailable` plus a type check for filing a transaction (or one of its
   * split items) under the category. Ownership alone let an income be filed
   * under an expense category whenever the client kept a stale categoryId
   * after a type switch, which then skewed the per-category breakdowns.
   * Transfers move money between the user's own accounts and take no category.
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
   * What still points at the category: live transactions that use it on the
   * transaction itself or on one of its split lines (each counted once), and
   * budgets. Deleted transactions don't count; they lose the category if it's
   * deleted.
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
