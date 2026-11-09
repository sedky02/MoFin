import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { ActivityIndicator, RefreshControl } from 'react-native';

import { COLORS } from '@/theme/colors';

// Spinners take their colours as props, which no class name reaches: left unset, Android draws them
// from the phone's theme, not the app's (a dark spinner on a light page when the two differ).

/** The current scheme's colours, for the few props a class name can't reach. */
export function useSchemeColors() {
  const { colorScheme } = useColorScheme();
  return COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
}

/** Pull-to-refresh in the app's colours. ScrollView clones it with its own style and children, which pass through. */
export function ThemedRefreshControl(props: React.ComponentProps<typeof RefreshControl>) {
  const c = useSchemeColors();
  const accent = c['primary-text'];
  return (
    <RefreshControl
      colors={[accent]}
      progressBackgroundColor={c.card}
      tintColor={c['muted-foreground']}
      {...props}
    />
  );
}

/** A loading spinner in the app's muted colour unless a colour is given (e.g. white on a red button). */
export function Spinner(props: React.ComponentProps<typeof ActivityIndicator>) {
  const c = useSchemeColors();
  return <ActivityIndicator color={c['muted-foreground']} {...props} />;
}
