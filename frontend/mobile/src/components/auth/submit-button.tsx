import * as React from 'react';
import { ActivityIndicator } from 'react-native';

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
  return (
    <Button
      size="lg"
      variant={variant}
      disabled={pending || props.disabled}
      aria-busy={pending}
      className={cn('min-h-[52px] w-full rounded-[14px]', className)}
      {...props}>
      {pending ? <ActivityIndicator size="small" /> : leading}
      <Text className="text-[15px] font-semibold">{pending ? pendingText : children}</Text>
      {arrow && !pending ? <Icon as={ArrowRight} size={18} className="text-primary-foreground" /> : null}
    </Button>
  );
}
