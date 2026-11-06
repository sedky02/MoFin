import { Text as RNText } from 'react-native';

import { Text } from '@/components/ui/text';
import { tryParse } from '@/core/decimal';
import { formatMoney } from '@/core/format';
import { cn } from '@/lib/utils';

type Props = {
  amount: string;
  currency: string;
  compact?: boolean;
  colorBySign?: boolean;
  signed?: boolean;
  className?: string;
  numberOfLines?: number;
};

export function splitLeadingSign(text: string): [string, string] {
  const m = /^([+\-\u2212])(.*)$/s.exec(text);
  return m ? [m[1], m[2]] : ['', text];
}

export function MoneyAmount({ amount, currency, compact = false, colorBySign = false, signed = false, className, numberOfLines }: Props) {
  const parsed = tryParse(amount);
  const isNeg = parsed?.isNegative() ?? false;
  const plus = signed && parsed && !parsed.isZero() && !isNeg ? '+' : '';
  const [lead, figures] = splitLeadingSign(plus + formatMoney(amount, currency, { compact }));
  return (
    <Text
      accessibilityLabel={formatMoney(amount, currency)}
      numberOfLines={numberOfLines}
      style={{ fontVariant: ['tabular-nums'] }}
      className={cn(colorBySign && (isNeg ? 'text-destructive' : 'text-success'), className)}>
      {/* Tabular figures make a sign as wide as a digit, which left a gap after it ("- 32.500"). */}
      {/* Plain RN Text so it inherits the size and colour (the app Text would reset them). */}
      {lead ? <RNText style={{ fontVariant: ['proportional-nums'] }}>{lead}</RNText> : null}
      {figures}
    </Text>
  );
}
