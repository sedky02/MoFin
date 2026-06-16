import { CategoryType } from '@prisma/client';
import { z } from 'zod';

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
