import * as React from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { Input } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Eye, EyeOff } from '@/lib/icons';
import { cn } from '@/lib/utils';

export type TextFieldHandle = React.ComponentRef<typeof TextInput>;

type Props<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  label: string;
  /** Shown after the label, muted (e.g. "(optional)"). */
  labelHint?: string;
  /** Sits on the label's row, on the right ("Forgot password?"). */
  labelAction?: React.ReactNode;
  description?: string;
  password?: boolean;
  children?: React.ReactNode;
  inputRef?: React.RefObject<TextFieldHandle | null>;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'onBlur' | 'secureTextEntry'>;

export function FormField<T extends FieldValues>({
  control,
  name,
  label,
  labelHint,
  labelAction,
  description,
  password,
  children,
  inputRef,
  ...inputProps
}: Props<T>) {
  const [revealed, setRevealed] = React.useState(false);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message;
        return (
          <View className="gap-2">
            <View className="flex-row items-baseline justify-between">
              <Text className="text-[13px] font-semibold">
                {label}
                {labelHint ? <Text className="text-[13px] font-normal text-muted-foreground"> {labelHint}</Text> : null}
              </Text>
              {labelAction}
            </View>
            <View className="justify-center">
              <Input
                // The Reusables Input types its ref as both RN's TextInput type and the instance type.
                ref={(node: TextFieldHandle | TextInput | null) => {
                  field.ref(node);
                  if (inputRef) inputRef.current = node as TextFieldHandle | null;
                }}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                secureTextEntry={password && !revealed}
                accessibilityLabel={label}
                accessibilityHint={error}
                className={cn('min-h-[52px] rounded-xl bg-card px-3.5 text-[15px]', password && 'pr-12', error && 'border-destructive')}
                {...inputProps}
              />
              {password ? (
                <Pressable
                  role="button"
                  accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
                  hitSlop={8}
                  onPress={() => setRevealed((r) => !r)}
                  className="absolute right-1 size-11 items-center justify-center">
                  <Icon as={revealed ? EyeOff : Eye} size={18} className="text-muted-foreground" />
                </Pressable>
              ) : null}
            </View>
            {description && !error ? <Text className="text-xs text-muted-foreground">{description}</Text> : null}
            {children}
            {error ? (
              <Text role="alert" className="text-sm text-destructive">
                {error}
              </Text>
            ) : null}
          </View>
        );
      }}
    />
  );
}
