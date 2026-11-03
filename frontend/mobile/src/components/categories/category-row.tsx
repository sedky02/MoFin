import { Archive, ArchiveRestore, Lock, Pencil } from 'lucide-react-native';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Category } from '@/core/types';
import { cn } from '@/lib/utils';

import { CategoryAvatar } from './category-avatar';

export type CategoryRowActions = {
  onEdit?: (c: Category) => void;
  onArchive?: (c: Category) => void;
  onRestore?: (c: Category) => void;
  /** Id of the category an archive or restore is in flight for. */
  busyId?: string;
};

export function CategoryRow({ category, onEdit, onArchive, onRestore, busyId }: { category: Category } & CategoryRowActions) {
  const busy = busyId === category.id;
  return (
    <View aria-busy={busy || undefined} className={cn('min-h-14 flex-row items-center gap-3 px-4 py-1.5', busy && 'opacity-60')}>
      <CategoryAvatar category={category} />
      <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-medium">
        {category.name}
      </Text>
      {category.isSystem ? (
        <View accessible accessibilityLabel="System category, read-only" className="min-h-11 flex-row items-center gap-1.5 px-2">
          <Icon as={Lock} size={14} aria-hidden className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">System</Text>
        </View>
      ) : onRestore ? (
        <Button
          variant="ghost"
          disabled={busy}
          className="min-h-11 gap-1.5"
          onPress={() => onRestore(category)}
          accessibilityLabel={`Restore ${category.name}`}>
          <Icon as={ArchiveRestore} size={16} className="text-muted-foreground" />
          <Text className="text-muted-foreground">Restore</Text>
        </Button>
      ) : (
        <View className="-mr-2 flex-row items-center">
          {onEdit ? (
            <Button variant="ghost" size="icon" className="size-11" onPress={() => onEdit(category)} accessibilityLabel={`Edit ${category.name}`}>
              <Icon as={Pencil} size={16} className="text-muted-foreground" />
            </Button>
          ) : null}
          {onArchive ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              disabled={busy}
              onPress={() => onArchive(category)}
              accessibilityLabel={`Archive ${category.name}`}>
              <Icon as={Archive} size={16} className="text-destructive" />
            </Button>
          ) : null}
        </View>
      )}
    </View>
  );
}
