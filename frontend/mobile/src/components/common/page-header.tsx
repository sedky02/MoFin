import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** The title block at the top of a screen: heading, optional description, optional action beside it. */
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('mb-6 flex-row items-end justify-between gap-3', className)}>
      <View className="min-w-0 flex-1">
        <Text role="heading" aria-level={1} className="text-[1.75rem] font-semibold leading-tight tracking-tight">
          {title}
        </Text>
        {description ? <Text className="mt-1 text-[0.9375rem] text-muted-foreground">{description}</Text> : null}
      </View>
      {action ? <View className="shrink-0">{action}</View> : null}
    </View>
  );
}
