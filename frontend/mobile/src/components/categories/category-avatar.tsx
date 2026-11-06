import { View } from 'react-native';

import { CategoryGlyphIcon } from '@/components/categories/category-glyph';
import type { Category } from '@/core/types';
import { cn } from '@/lib/utils';

export function CategoryAvatar({
  category,
  className,
}: {
  category: Pick<Category, 'name' | 'color' | 'icon'>;
  className?: string;
}) {
  const color = category.color || '#78716c';
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      className={cn('size-10 shrink-0 items-center justify-center rounded-xl', className)}
      style={{ backgroundColor: `${color}22` }}>
      <CategoryGlyphIcon category={category} size={20} color={color} />
    </View>
  );
}
