import { Stack } from 'expo-router';
import { View } from 'react-native';

import { OfflineBanner } from '@/components/shell/offline-banner';
import { StackHeader } from '@/components/shell/stack-header';
import { useStackScreenOptions } from '@/components/shell/stack-options';
import { VoiceOverlay } from '@/components/voice/voice-overlay';
import { useWidgetSync } from '@/widgets/use-widget-sync';

export default function AppLayout() {
  const options = useStackScreenOptions();
  // Home screen widgets follow the data while signed in (Android).
  useWidgetSync();
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
          {/* Sets its own title (the account's name). */}
          <Stack.Screen name="accounts/[id]" options={{ title: 'People' }} />
          <Stack.Screen name="invitations" options={{ title: 'Invitation' }} />
          <Stack.Screen name="categories/index" options={{ title: 'Categories' }} />
          <Stack.Screen name="goals/index" options={{ title: 'Goals' }} />
          <Stack.Screen name="connect/index" options={{ title: 'Connect AI' }} />
          <Stack.Screen name="ask/index" options={{ title: 'Ask MoFin' }} />
          {/* The chat sets its own title (its name, or "New chat"). */}
          <Stack.Screen name="ask/[id]" options={{ title: 'Chat' }} />
          <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
          {/* A widget's ↻ passes through here on its way to the widget's screen. */}
          <Stack.Screen name="widget-refresh" options={{ headerShown: false, animation: 'none' }} />
          {/* Opened by the launcher when a MoFin widget is added: what it shows. */}
          <Stack.Screen name="widget-setup" options={{ title: 'Widget' }} />
          {/* Development only: the guard keeps the route out of release builds. */}
          <Stack.Protected guard={__DEV__}>
            <Stack.Screen name="_dev/kitchen-sink" options={{ title: 'Kitchen sink' }} />
          </Stack.Protected>
        </Stack>
      </View>
      {/* Opened by holding the Add button; drawn over whatever screen is showing. */}
      <VoiceOverlay />
    </View>
  );
}
