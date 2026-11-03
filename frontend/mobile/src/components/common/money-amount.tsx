import { Text } from '@/components/ui/text';
import { tryParse } from '@/core/decimal';
import { formatMoney } from '@/core/format';
import { cn } from '@/lib/utils';

type Props = {
  amount: string;
  currency: string;
  /** Abbreviate large values ("$1.2K"). */
  compact?: boolean;
  /** Color by sign: positive = success, negative = destructive. */
  colorBySign?: boolean;
  /** Prefix a + explicitly (for transaction rows). */
  signed?: boolean;
  className?: string;
};

/** A formatted money value. Screen readers get the full (non-compact) value. */
export function MoneyAmount({ amount, currency, compact = false, colorBySign = false, signed = false, className }: Props) {
  const parsed = tryParse(amount);
  const isNeg = parsed?.isNegative() ?? false;
  const sign = signed && parsed && !parsed.isZero() && !isNeg ? '+' : '';
  return (
    <Text
      accessibilityLabel={formatMoney(amount, currency)}
      style={{ fontVariant: ['tabular-nums'] }}
      className={cn(colorBySign && (isNeg ? 'text-destructive' : 'text-success'), className)}>
      {sign}
      {formatMoney(amount, currency, { compact })}
    </Text>
  );
}
