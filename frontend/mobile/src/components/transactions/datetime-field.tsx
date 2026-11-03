// Native date / date-and-time field (iOS and Android). Expo web has no picker implementation, so
// datetime-field.web.tsx renders the browser's own <input type="datetime-local"> instead.
//
// The value is the web form's string: "YYYY-MM-DDTHH:mm" (mode "datetime") or "YYYY-MM-DD" (mode
// "date"), in the device's local time, so the zod schema and the submit mapping see what the web sees.
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CalendarDays, X } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { Platform, Pressable, View } from 'react-native';

import { localDateTimeToDate, toDateInput } from '@/components/transactions/transaction-form-model';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { formatDate, formatDateTime, toDatetimeLocal } from '@/core/format';
import { cn } from '@/lib/utils';
import { COLORS } from '@/theme/colors';

export type DateTimeFieldProps = {
  mode: 'datetime' | 'date';
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Read by screen readers (the visible label sits above the field). */
  accessibilityLabel: string;
  /** Shown while there is no value (an optional end date). */
  placeholder?: string;
  /** Lets the value be cleared (an optional field). */
  clearable?: boolean;
  /** The day an empty field starts from when opened. */
  initialDate?: Date;
  invalid?: boolean;
  testID?: string;
};

export function toFieldValue(mode: DateTimeFieldProps['mode'], date: Date): string {
  return mode === 'date' ? toDateInput(date) : toDatetimeLocal(date.toISOString());
}

export function fieldLabel(mode: DateTimeFieldProps['mode'], value: string): string {
  const date = localDateTimeToDate(value);
  if (!date) return '';
  return mode === 'date' ? formatDate(date.toISOString()) : formatDateTime(date.toISOString());
}

export function DateTimeField({
  mode,
  value,
  onChange,
  onBlur,
  accessibilityLabel,
  placeholder = 'Choose a date',
  clearable,
  initialDate,
  invalid,
  testID,
}: DateTimeFieldProps) {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const date = localDateTimeToDate(value);
  // iOS shows its compact picker in place once there is a value; an empty optional field is a button.
  const [iosEditing, setIosEditing] = React.useState(false);

  function commit(next: Date) {
    onChange(toFieldValue(mode, next));
    onBlur?.();
  }

  function openAndroid() {
    const start = date ?? initialDate ?? new Date();
    DateTimePickerAndroid.open({
      value: start,
      mode: 'date',
      onValueChange: (_e, picked) => {
        if (mode === 'date') {
          commit(picked);
          return;
        }
        // Android has no combined picker: the time dialog follows the date one.
        DateTimePickerAndroid.open({
          value: picked,
          mode: 'time',
          onValueChange: (_t, time) => {
            const merged = new Date(picked);
            merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
            commit(merged);
          },
          onDismiss: () => commit(picked),
        });
      },
      onDismiss: onBlur,
    });
  }

  const clearButton =
    clearable && value ? (
      <Pressable
        role="button"
        accessibilityLabel={`Clear ${accessibilityLabel.toLowerCase()}`}
        onPress={() => {
          setIosEditing(false);
          onChange('');
          onBlur?.();
        }}
        hitSlop={8}
        className="size-11 items-center justify-center rounded-full active:bg-accent">
        <Icon as={X} size={16} aria-hidden className="text-muted-foreground" />
      </Pressable>
    ) : null;

  if (Platform.OS === 'ios' && (date || iosEditing)) {
    return (
      <View
        testID={testID}
        className={cn(
          'min-h-12 flex-row items-center justify-between rounded-xl bg-muted/50 pl-1',
          invalid && 'border border-destructive',
        )}>
        <DateTimePicker
          value={date ?? initialDate ?? new Date()}
          mode={mode}
          display="compact"
          themeVariant={scheme}
          accentColor={COLORS[scheme]['primary-text']}
          accessibilityLabel={accessibilityLabel}
          onValueChange={(_e, picked) => commit(picked)}
        />
        {clearButton}
      </View>
    );
  }

  const label = fieldLabel(mode, value);
  return (
    <View
      testID={testID}
      className={cn('min-h-12 flex-row items-center rounded-xl bg-muted/50', invalid && 'border border-destructive')}>
      <Pressable
        role="button"
        accessibilityLabel={`${accessibilityLabel}: ${label || placeholder}`}
        accessibilityHint="Opens a date picker"
        onPress={() => {
          if (Platform.OS === 'ios') {
            setIosEditing(true);
            if (!date) commit(initialDate ?? new Date());
          } else openAndroid();
        }}
        className="min-h-12 flex-1 flex-row items-center gap-2 px-3 active:opacity-70">
        <Icon as={CalendarDays} size={16} aria-hidden className="text-muted-foreground" />
        <Text
          style={{ fontVariant: ['tabular-nums'] }}
          className={cn('text-base', !label && 'text-muted-foreground')}>
          {label || placeholder}
        </Text>
      </Pressable>
      {clearButton}
    </View>
  );
}
