import { z } from 'zod';

import { CATEGORY_COLORS } from '@/core/constants';
import type { Category, CategoryType } from '@/core/types';

export const CATEGORY_NAME_MAX = 40;

// Same rules and messages as the web's category dialog.
export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Give the category a name.').max(CATEGORY_NAME_MAX, `Keep it under ${CATEGORY_NAME_MAX} characters.`),
  type: z.enum(['INCOME', 'EXPENSE']),
  color: z.string().trim().optional(),
  // An icon key, an emoji kept from an older version, or empty to pick one from the name.
  icon: z.string().optional(),
});
export type CategoryDraft = z.infer<typeof categorySchema>;

export function initialCategoryDraft(category?: Category, defaultType?: CategoryType): CategoryDraft {
  return {
    name: category?.name ?? '',
    type: category?.type ?? defaultType ?? 'EXPENSE',
    color: category?.color ?? CATEGORY_COLORS[0],
    icon: category?.icon ?? '',
  };
}

export function validateCategoryDraft(draft: CategoryDraft): { ok: true; values: CategoryDraft } | { ok: false; error: string } {
  const parsed = categorySchema.safeParse(draft);
  return parsed.success ? { ok: true, values: parsed.data } : { ok: false, error: parsed.error.issues[0].message };
}

export function duplicateNameMessage(type: CategoryType, name: string): string {
  return `You already have ${type === 'INCOME' ? 'an income' : 'an expense'} category called “${name}”.`;
}
