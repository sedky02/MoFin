import * as React from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** What a ref to a text field holds (focus(), blur()). */
export type TextFieldHandle = React.ComponentRef<typeof TextInput>;

type Props<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  label: string;
  /** Shown after the label, muted (e.g. "(optional)"). */
  labelHint?: string;
  /** Shown under the field while it has no error. */
  description?: string;
  /** A show/hide toggle; the value is masked by default. */
  password?: boolean;
  /** Extra content under the input (the password strength meter). */
  children?: React.ReactNode;
  inputRef?: React.RefObject<TextFieldHandle | null>;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'onBlur' | 'secureTextEntry'>;

/** A labelled text field bound to react-hook-form, with its error message under it. */
export function FormField<T extends FieldValues>({
  control,
  name,
  label,
  labelHint,
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
          <View className="gap-1.5">
            <Text className="text-sm font-medium">
              {label}
              {labelHint ? <Text className="text-sm text-muted-foreground"> {labelHint}</Text> : null}
            </Text>
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
                className={cn('h-11 sm:h-11', password && 'pr-16', error && 'border-destructive')}
                {...inputProps}
              />
              {password ? (
                <Pressable
                  role="button"
                  accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
                  hitSlop={8}
                  onPress={() => setRevealed((r) => !r)}
                  className="absolute right-3 h-full justify-center">
                  <Text className="text-xs font-medium text-muted-foreground">{revealed ? 'Hide' : 'Show'}</Text>
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
