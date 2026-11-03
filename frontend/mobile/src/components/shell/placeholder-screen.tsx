import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/common/states';

/** A screen a later phase fills: an EmptyState inside a scrolling, safe-area-aware page. */
export function PlaceholderScreen({
  icon,
  title,
  description,
  tabs = false,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  /** True inside the tab bar, which already covers the bottom inset. */
  tabs?: boolean;
  children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-4 p-4"
      contentContainerStyle={{ paddingBottom: 16 + (tabs ? 0 : insets.bottom) }}>
      <EmptyState icon={icon} title={title} description={description} />
      {children}
    </ScrollView>
  );
}
