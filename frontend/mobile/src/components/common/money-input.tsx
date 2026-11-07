import * as React from 'react';
import { Platform, TextInput, View } from 'react-native';

import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import {
  currencyFractionDigits,
  formatMoneyInput,
  moneyInputHint,
  moneyInputPrefix,
  normalizeMoneyTyping,
  normalizeSignedMoneyTyping,
  signedMoneyInputHint,
} from '@/core/format';
import { cn } from '@/lib/utils';

export function zeroPlaceholder(currency?: string): string {
  const digits = currencyFractionDigits(currency);
  return digits > 0 ? `0.${'0'.repeat(digits)}` : '0';
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  currency?: string;
  disabled?: boolean;
  className?: string;
  large?: boolean;
  allowNegative?: boolean;
  invalid?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Form state holds what was typed; tidied to the currency's decimals on blur, with a reading shown
 * when ambiguous or rounded ("= 1,234.00"). No paste interception on mobile (no paste event).
 */
export function MoneyInput({
  value,
  onChange,
  onBlur,
  currency,
  disabled,
  className,
  large,
  allowNegative = false,
  invalid,
  accessibilityLabel,
  testID,
}: Props) {
  const hint = allowNegative ? signedMoneyInputHint(value, currency) : moneyInputHint(value, currency);
  // Phone decimal keypads have no minus key, so a signed field asks for the full keyboard.
  const keyboardType = allowNegative
    ? Platform.select({ ios: 'numbers-and-punctuation' as const, default: 'default' as const })
    : ('decimal-pad' as const);
  const label = accessibilityLabel ?? (currency ? `Amount in ${currency}` : 'Amount');

  function handleBlur() {
    const normalize = allowNegative ? normalizeSignedMoneyTyping : normalizeMoneyTyping;
    const normalized = value ? normalize(value) : null;
    if (normalized !== null) {
      const tidy = formatMoneyInput(normalized, currency);
      if (tidy && tidy !== value) onChange(tidy);
    }
    onBlur?.();
  }

  const hintRegion = (
    <View accessibilityLiveRegion="polite">
      {hint ? (
        <Text
          testID="money-input-hint"
          style={{ fontVariant: ['tabular-nums'] }}
          className={cn('mt-1 text-xs text-muted-foreground', large && 'text-center text-sm')}>
          {hint}
        </Text>
      ) : null}
    </View>
  );

  const common = {
    value,
    onChangeText: onChange,
    onBlur: handleBlur,
    editable: !disabled,
    keyboardType,
    autoComplete: 'off' as const,
    autoCorrect: false,
    // Zero with the currency's own decimals: 0.000 for TND, 0 for JPY, 0.00 otherwise.
    placeholder: zeroPlaceholder(currency),
    accessibilityLabel: label,
    'aria-invalid': invalid,
    testID,
  };

  if (large) {
    return (
      <View className="items-center">
        <Text aria-hidden className="mb-2 text-xs font-medium leading-4 tracking-widest text-muted-foreground">
          {currency}
        </Text>
        <TextInput
          {...common}
          // An explicit box: with the class's tight line height Android clipped the top of the digits
          // (they looked cut under the currency code) and added its own font padding.
          style={{
            fontVariant: ['tabular-nums'],
            fontSize: 44,
            lineHeight: 54,
            height: 60,
            paddingVertical: 0,
            includeFontPadding: false,
            textAlignVertical: 'center',
          }}
          placeholderClassName="text-muted-foreground/40"
          className={cn(
            'w-full bg-transparent text-center font-semibold tracking-tight text-foreground',
            invalid && 'text-destructive',
            disabled && 'opacity-60',
            className,
          )}
        />
        {hintRegion}
      </View>
    );
  }

  const symbol = moneyInputPrefix(currency);
  return (
    <View>
      <View className="justify-center">
        {symbol ? (
          <Text
            aria-hidden
            pointerEvents="none"
            className="absolute left-3 z-10 text-sm text-muted-foreground"
            style={{ fontVariant: ['tabular-nums'] }}>
            {symbol}
          </Text>
        ) : null}
        <Input
          {...common}
          style={{ fontVariant: ['tabular-nums'] }}
          className={cn(
            'min-h-11',
            !symbol ? 'pl-3' : symbol.length > 1 ? 'pl-9' : 'pl-7',
            currency && 'pr-14',
            invalid && 'border-destructive',
            className,
          )}
        />
        {currency ? (
          <Text
            aria-hidden
            pointerEvents="none"
            className="absolute right-3 text-xs font-medium text-muted-foreground">
            {currency}
          </Text>
        ) : null}
      </View>
      {hintRegion}
    </View>
  );
}
