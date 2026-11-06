import { Prisma } from '@prisma/client';
import { PaginatedResult } from '../common/dto/pagination';

// Exported because PrismaService.paginated's inferred type references it, and declaration emit
// (`nest build`) needs it nameable (TS4029).
export interface PaginateInput {
  limit: number;
  offset: number;
}

/**
 * Adds `.paginate()` to every model: findMany + count in parallel, as { data, total, limit, offset
 * }. The `as` casts are Prisma's limit for generic $allModels; call sites stay typed.
 */
export const paginationExtension = Prisma.defineExtension({
  name: 'pagination',
  model: {
    $allModels: {
      async paginate<T, A extends Prisma.Args<T, 'findMany'>>(
        this: T,
        input: A & PaginateInput,
      ): Promise<PaginatedResult<Prisma.Result<T, A, 'findMany'>[number]>> {
        const { limit, offset, ...rest } = input as PaginateInput &
          Record<string, unknown>;
        const findManyArgs: Record<string, unknown> = rest;
        const context = Prisma.getExtensionContext(this);
        const findMany = (
          context as { findMany: (args: unknown) => Promise<unknown> }
        ).findMany;
        const count = (context as { count: (args: unknown) => Promise<number> })
          .count;

        const [data, total] = await Promise.all([
          findMany({ ...findManyArgs, skip: offset, take: limit }),
          count({ where: findManyArgs.where }),
        ]);

        return {
          data: data as Prisma.Result<T, A, 'findMany'>[number][],
          total,
          limit,
          offset,
        };
      },
    },
  },
});
