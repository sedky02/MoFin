import * as React from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function AuthChip({ icon, children }: { icon: React.ComponentProps<typeof Icon>['as']; children: string }) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full border border-border px-3 py-1.5">
      <Icon as={icon} size={14} className="text-muted-foreground" />
      <Text className="text-[13px] text-muted-foreground">{children}</Text>
    </View>
  );
}
