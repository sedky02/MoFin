import * as React from 'react';

import { Spinner, useSchemeColors } from '@/components/ui/themed-native';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ArrowRight } from '@/lib/icons';
import { cn } from '@/lib/utils';

export function SubmitButton({
  pending,
  pendingText,
  children,
  className,
  variant,
  arrow = false,
  leading,
  ...props
}: ButtonProps & { pending: boolean; pendingText: string; children: string; arrow?: boolean; leading?: React.ReactNode }) {
  const c = useSchemeColors();
  // On the lime button the spinner takes the button's text colour; other variants keep the muted one.
  const spinnerColor = !variant || variant === 'default' ? c['primary-foreground'] : undefined;
  return (
    <Button
      size="lg"
      variant={variant}
      disabled={pending || props.disabled}
      aria-busy={pending}
      className={cn('min-h-[52px] w-full rounded-[14px]', className)}
      {...props}>
      {pending ? <Spinner size="small" color={spinnerColor} /> : leading}
      <Text className="text-[15px] font-semibold">{pending ? pendingText : children}</Text>
      {arrow && !pending ? <Icon as={ArrowRight} size={18} className="text-primary-foreground" /> : null}
    </Button>
  );
}
