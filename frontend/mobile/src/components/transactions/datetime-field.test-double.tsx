// Jest stand-in for DateTimeField (the native picker needs native code): a text field with the same
// value contract ("YYYY-MM-DDTHH:mm" / "YYYY-MM-DD"). Used by transaction-form.test.tsx only.
import { TextInput } from 'react-native';

import type { DateTimeFieldProps } from '@/components/transactions/datetime-field';

export function DateTimeField({ value, onChange, accessibilityLabel }: DateTimeFieldProps) {
  return <TextInput value={value} onChangeText={onChange} accessibilityLabel={accessibilityLabel} />;
}
