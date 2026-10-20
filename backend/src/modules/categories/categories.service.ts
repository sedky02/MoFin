import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto, ListCategoriesQueryDto, UpdateCategoryDto } from './dto/categories.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

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
  private toResponse<T extends { userId: string | null }>(category: T): T & { isSystem: boolean } {
    return { ...category, isSystem: category.userId === null };
  }

  async create(userId: string, dto: CreateCategoryDto) {
    const category = await this.prisma.category.create({ data: { ...dto, userId } });
    return this.toResponse(category);
  }

  async list(userId: string, query: ListCategoriesQueryDto) {
    const page = await this.prisma.paginated.category.paginate({
      where: { OR: [{ userId }, { userId: null }] },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      limit: query.limit,
      offset: query.offset
    });
    return { ...page, data: page.data.map((category) => this.toResponse(category)) };
  }

  async assertAvailable(userId: string, categoryId?: string | null) {
    if (!categoryId) return null;
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, OR: [{ userId }, { userId: null }] }
    });
    if (!category) throw new NotFoundException(`Category ${categoryId} not found`);
    return category;
  }

  /**
   * `assertAvailable` plus a type check for filing a transaction (or one of its
   * split items) under the category. Ownership alone let an income be filed
   * under an expense category whenever the client kept a stale categoryId
   * after a type switch, which then skewed the per-category breakdowns.
   * Transfers move money between the user's own accounts and take no category.
   */
  async assertAssignable(userId: string, transactionType: TransactionType, categoryId?: string | null) {
    if (!categoryId) return null;
    if (transactionType === TransactionType.TRANSFER) {
      throw new BadRequestException('Transfers cannot have a category');
    }
    const category = await this.assertAvailable(userId, categoryId);
    if (category && category.type !== transactionType) {
      throw new BadRequestException(
        `"${category.name}" is an ${category.type.toLowerCase()} category and cannot be used on an ${transactionType.toLowerCase()} transaction`,
      );
    }
    return category;
  }

  async update(userId: string, categoryId: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findFirst({ where: { id: categoryId, userId } });
    if (!category) throw new NotFoundException(`Category ${categoryId} not found`);
    const updated = await this.prisma.category.update({ where: { id: categoryId }, data: dto });
    return this.toResponse(updated);
  }

  async remove(userId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({ where: { id: categoryId, userId } });
    if (!category) throw new NotFoundException(`Category ${categoryId} not found`);

    const [transactionCount, transactionItemCount, budgetCount] = await Promise.all([
      this.prisma.transaction.count({ where: { categoryId } }),
      this.prisma.transactionItem.count({ where: { categoryId } }),
      this.prisma.budget.count({ where: { categoryId } }),
    ]);
    if (transactionCount > 0 || transactionItemCount > 0 || budgetCount > 0) {
      throw new ConflictException(
        'This category is used by existing transactions or budgets and cannot be deleted.',
      );
    }

    await this.prisma.category.delete({ where: { id: categoryId } });
  }
}
