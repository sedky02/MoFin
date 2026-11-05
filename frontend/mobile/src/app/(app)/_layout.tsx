import { Stack } from 'expo-router';
import { View } from 'react-native';

import { OfflineBanner } from '@/components/shell/offline-banner';
import { StackHeader } from '@/components/shell/stack-header';
import { useStackScreenOptions } from '@/components/shell/stack-options';

export default function AppLayout() {
  const options = useStackScreenOptions();
  return (
    <View className="flex-1 bg-background">
      <OfflineBanner />
      <View className="flex-1">
        {/* Every pushed screen uses the same header as the tabs: round back button (✕ on a sheet), then the title. */}
        <Stack screenOptions={{ ...options, header: (props) => <StackHeader {...props} /> }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* The add form is a sheet over the tabs, closed with ✕. */}
          <Stack.Screen name="transactions/new" options={{ title: 'New transaction', presentation: 'modal' }} />
          <Stack.Screen name="transactions/[id]/index" options={{ title: 'Transaction' }} />
          <Stack.Screen name="accounts/index" options={{ title: 'Accounts' }} />
          <Stack.Screen name="categories/index" options={{ title: 'Categories' }} />
          <Stack.Screen name="goals/index" options={{ title: 'Goals' }} />
          <Stack.Screen name="connect/index" options={{ title: 'Connect AI' }} />
          <Stack.Screen name="ask/index" options={{ title: 'Ask MoFin' }} />
          {/* The chat sets its own title (its name, or "New chat"). */}
          <Stack.Screen name="ask/[id]" options={{ title: 'Chat' }} />
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
