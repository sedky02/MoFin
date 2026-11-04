import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOnline } from '@/hooks/use-online';
import { WifiOff } from '@/lib/icons';

export const OFFLINE_MESSAGE = "You're offline. Showing what was loaded; changes will work once you're back online.";

/** A calm strip under the header while the device has no connection. Hidden when online. */
export function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View
      role="alert"
      accessibilityLiveRegion="polite"
      className="flex-row items-center gap-2 border-b border-border bg-muted px-4 pb-2.5"
      // The banner sits above the stack header, so it owns the status-bar inset while it shows.
      style={{ paddingTop: insets.top + 10 }}>
      <Icon as={WifiOff} size={16} aria-hidden className="text-muted-foreground" />
      <Text className="flex-1 text-sm text-muted-foreground">{OFFLINE_MESSAGE}</Text>
    </View>
  );
}
