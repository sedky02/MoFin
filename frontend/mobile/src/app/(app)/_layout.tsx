import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/components/shell/stack-options';

export default function AppLayout() {
  const options = useStackScreenOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* The add form is a modal over the tabs (the form itself is built in a later phase). */}
      <Stack.Screen name="transactions/new" options={{ title: 'New Transaction', presentation: 'modal' }} />
      <Stack.Screen name="accounts/index" options={{ title: 'Accounts' }} />
      <Stack.Screen name="categories/index" options={{ title: 'Categories' }} />
      <Stack.Screen name="drafts/index" options={{ title: 'Drafts' }} />
      <Stack.Screen name="connect/index" options={{ title: 'AI Connector' }} />
      <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
      {/* Development only: the guard keeps the route out of release builds. */}
      <Stack.Protected guard={__DEV__}>
        <Stack.Screen name="_dev/kitchen-sink" options={{ title: 'Kitchen sink' }} />
      </Stack.Protected>
    </Stack>
  );
}
