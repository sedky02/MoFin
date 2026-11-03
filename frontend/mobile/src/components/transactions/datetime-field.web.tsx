// Expo web: @react-native-community/datetimepicker has no web implementation, so the field is the
// browser's own input, exactly the web app's `<input type="datetime-local">` / `type="date"`.
import { X } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import type { DateTimeFieldProps } from '@/components/transactions/datetime-field';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { COLORS } from '@/theme/colors';

export function DateTimeField({
  mode,
  value,
  onChange,
  onBlur,
  accessibilityLabel,
  clearable,
  invalid,
  testID,
}: DateTimeFieldProps) {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const c = COLORS[scheme];
  return (
    <View
      testID={testID}
      className={cn('min-h-12 flex-row items-center rounded-xl bg-muted/50', invalid && 'border border-destructive')}>
      {React.createElement('input', {
        type: mode === 'date' ? 'date' : 'datetime-local',
        value,
        'aria-label': accessibilityLabel,
        'aria-invalid': invalid || undefined,
        onChange: (e: { target: { value: string } }) => onChange(e.target.value),
        onBlur,
        style: {
          flex: 1,
          minWidth: 0,
          height: 48,
          padding: '0 12px',
          border: 0,
          background: 'transparent',
          color: c.foreground,
          colorScheme: scheme,
          fontFamily: 'Inter_400Regular, Inter, system-ui, sans-serif',
          fontSize: 16,
          fontVariantNumeric: 'tabular-nums',
          borderRadius: 12,
        },
      })}
      {clearable && value ? (
        <Pressable
          role="button"
          accessibilityLabel={`Clear ${accessibilityLabel.toLowerCase()}`}
          onPress={() => {
            onChange('');
            onBlur?.();
          }}
          className="size-11 items-center justify-center rounded-full active:bg-accent">
          <Icon as={X} size={16} aria-hidden className="text-muted-foreground" />
        </Pressable>
      ) : null}
    </View>
  );
}
