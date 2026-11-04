import { Stack } from 'expo-router';
import { Platform, View } from 'react-native';

import { HeaderBackFallback } from '@/components/shell/header-back-fallback';
import { OfflineBanner } from '@/components/shell/offline-banner';
import { useStackScreenOptions } from '@/components/shell/stack-options';
import { backFallbackHref } from '@/lib/back-fallback';

export default function AppLayout() {
  const options = useStackScreenOptions();
  return (
    <View className="flex-1 bg-background">
      <OfflineBanner />
      <View className="flex-1">
        <Stack
          screenOptions={({ navigation, route }) =>
            // A page opened from a link or reloaded in the browser has no history, so the header had
            // no back button at all. Give it one that goes where the page is normally opened from.
            Platform.OS === 'web' && route.name !== '(tabs)' && !navigation.canGoBack()
              ? {
                  ...options,
                  headerLeft: ({ tintColor }) => (
                    <HeaderBackFallback href={backFallbackHref(route.name, route.params as Record<string, unknown>)} tintColor={tintColor} />
                  ),
                }
              : options
          }>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* The add form is a modal over the tabs. */}
          <Stack.Screen name="transactions/new" options={{ title: 'New transaction', presentation: 'modal' }} />
          <Stack.Screen name="accounts/index" options={{ title: 'Accounts' }} />
          <Stack.Screen name="categories/index" options={{ title: 'Categories' }} />
          <Stack.Screen name="drafts/index" options={{ title: 'Drafts' }} />
          <Stack.Screen name="connect/index" options={{ title: 'AI connector' }} />
          <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
          {/* Development only: the guard keeps the route out of release builds. */}
          <Stack.Protected guard={__DEV__}>
            <Stack.Screen name="_dev/kitchen-sink" options={{ title: 'Kitchen sink' }} />
          </Stack.Protected>
        </Stack>
      </View>
    </View>
  );
}
