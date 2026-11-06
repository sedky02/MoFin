import { CategoryType } from '@prisma/client';
import { z } from 'zod';
import { paginationSchema } from '../../../common/dto/pagination';

export const createCategorySchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(CategoryType),
  color: z.string().optional(),
  icon: z.string().optional(),
});
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;

// Archived categories are left out unless asked for, so pickers never offer them.
export const listCategoriesQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'archived', 'all']).default('active'),
  /** Only INCOME or only EXPENSE categories, e.g. the ones that fit a draft. */
  type: z.nativeEnum(CategoryType).optional(),
});
export type ListCategoriesQueryDto = z.infer<typeof listCategoriesQuerySchema>;
