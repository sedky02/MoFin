import { ActivityIndicator } from 'react-native';

import { Button, type ButtonProps } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** A full-width primary button that shows `pendingText` and a spinner while its action runs. */
export function SubmitButton({
  pending,
  pendingText,
  children,
  className,
  variant,
  ...props
}: ButtonProps & { pending: boolean; pendingText: string; children: string }) {
  return (
    <Button
      size="lg"
      variant={variant}
      disabled={pending || props.disabled}
      aria-busy={pending}
      className={cn('h-11 w-full sm:h-11', className)}
      {...props}>
      {pending ? <ActivityIndicator size="small" /> : null}
      <Text className="text-sm font-semibold">{pending ? pendingText : children}</Text>
    </Button>
  );
}
