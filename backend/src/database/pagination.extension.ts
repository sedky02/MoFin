import { Prisma } from '@prisma/client';
import { PaginatedResult } from '../common/dto/pagination';

// Exported (not just used locally) because PrismaService.paginated's
// inferred public type references it — declaration emit (`nest build`)
// requires every type reachable from a public class member to be nameable
// from outside this module, unlike plain `tsc --noEmit`, which doesn't
// surface this (TS4029).
export interface PaginateInput {
  limit: number;
  offset: number;
}

/**
 * Adds `.paginate()` to every Prisma model, running `findMany` + `count`
 * in parallel against the same `where` and returning
 * `{ data, total, limit, offset }` instead of a bare array (audit DATA-XX).
 *
 * The two `as` casts below are Prisma's own documented limitation for
 * generic `$allModels` extension methods — the declaration can't
 * structurally know which model it's attached to, so `getExtensionContext`
 * can't statically expose `.findMany`/`.count`. Call sites are unaffected:
 * `prisma.paginated.transaction.paginate({...})` resolves concrete,
 * fully-typed `where`/`include`/`orderBy` args and a correctly-typed
 * `data` array, exactly like a normal `findMany` call.
 */
export const paginationExtension = Prisma.defineExtension({
  name: 'pagination',
  model: {
    $allModels: {
      async paginate<T, A extends Prisma.Args<T, 'findMany'>>(
        this: T,
        { limit, offset, ...findManyArgs }: A & PaginateInput
      ): Promise<PaginatedResult<Prisma.Result<T, A, 'findMany'>[number]>> {
        const context = Prisma.getExtensionContext(this);
        const findMany = (context as { findMany: (args: unknown) => Promise<unknown> }).findMany;
        const count = (context as { count: (args: unknown) => Promise<number> }).count;

        const [data, total] = await Promise.all([
          findMany({ ...findManyArgs, skip: offset, take: limit }),
          count({ where: (findManyArgs as { where?: unknown }).where })
        ]);

        return { data: data as Prisma.Result<T, A, 'findMany'>[number][], total, limit, offset };
      }
    }
  }
});
