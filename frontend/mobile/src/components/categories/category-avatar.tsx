import { Tags } from 'lucide-react-native';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { categoryIconFor } from '@/core/category-icons';
import type { Category } from '@/core/types';
import { cn } from '@/lib/utils';

/** A category's colour tile with its icon in that colour. An old emoji icon still shows as the emoji. */
export function CategoryAvatar({
  category,
  className,
}: {
  category: Pick<Category, 'name' | 'color' | 'icon'>;
  className?: string;
}) {
  const chosen = categoryIconFor(category.icon);
  const color = category.color || '#78716c';
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      className={cn('size-10 shrink-0 items-center justify-center rounded-xl', className)}
      style={{ backgroundColor: `${color}22` }}>
      {chosen ? (
        <Icon as={chosen.Icon} size={20} color={color} />
      ) : category.icon ? (
        <Text className="text-lg">{category.icon}</Text>
      ) : (
        <Icon as={Tags} size={20} color={color} />
      )}
    </View>
  );
}
