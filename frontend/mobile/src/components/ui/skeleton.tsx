import { cn } from '@/lib/utils';
import { View } from 'react-native';

function Skeleton({
  className,
  ...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  // A neutral grey in both themes (the light accent is lime-tinted, which read as content).
  return <View className={cn('bg-muted-foreground/15 animate-pulse rounded-md dark:bg-accent', className)} {...props} />;
}

export { Skeleton };
