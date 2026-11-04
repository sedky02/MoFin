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

/** The empty field's placeholder: zero written with the currency's decimals. */
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
  /** Hero style: bare, centred, oversized figure with the currency code above. */
  large?: boolean;
  /** Accept one leading minus (an opening balance can be below zero). */
  allowNegative?: boolean;
  invalid?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Money text field. Form state holds exactly what was typed; it's normalised and tidied to the
 * currency's decimals on blur. While the text could be read more than one way ("1,234") or will be
 * rounded, the interpreted value is shown under the field ("= 1,234.00").
 *
 * Mobile difference: there is no paste interception (React Native has no paste event). Pasted text
 * goes through the same blur normalisation.
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
        <Text aria-hidden className="mb-1 h-4 text-xs font-medium tracking-widest text-muted-foreground">
          {currency}
        </Text>
        <TextInput
          {...common}
          style={{ fontVariant: ['tabular-nums'] }}
          placeholderTextColor="rgba(128,128,128,0.4)"
          className={cn(
            'w-full bg-transparent text-center text-5xl font-semibold tracking-tight text-foreground',
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
