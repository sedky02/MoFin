import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/categories.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: { ...dto, userId } });
  }

  list(userId: string) {
    return this.prisma.category.findMany({
      where: { OR: [{ userId }, { userId: null }] },
      orderBy: [{ type: 'asc' }, { name: 'asc' }]
    });
  }

  async assertAvailable(userId: string, categoryId?: string | null) {
    if (!categoryId) return null;
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, OR: [{ userId }, { userId: null }] }
    });
    if (!category) throw new NotFoundException(`Category ${categoryId} not found`);
    return category;
  }

  async update(userId: string, categoryId: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findFirst({ where: { id: categoryId, userId } });
    if (!category) throw new NotFoundException(`Category ${categoryId} not found`);
    return this.prisma.category.update({ where: { id: categoryId }, data: dto });
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
