import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { STRENGTH } from '@/lib/auth-forms';
import { cn } from '@/lib/utils';

/** Four segments that fill with the score (0-4), the hint on the left and the verdict on the right. */
export function PasswordStrengthMeter({ strength, hasValue, hint }: { strength: number; hasValue: boolean; hint?: string }) {
  return (
    <View>
      <View className="flex-row gap-[5px]" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className={cn('h-[5px] flex-1 rounded-[3px]', i < strength ? STRENGTH[strength].cls : 'bg-border')} />
        ))}
      </View>
      <View className="mt-2.5 flex-row justify-between">
        <Text className="text-xs text-muted-foreground">{hint ?? ''}</Text>
        <Text className="text-xs font-semibold">{hasValue ? STRENGTH[strength].label : ''}</Text>
      </View>
    </View>
  );
}
