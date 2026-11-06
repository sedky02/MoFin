import '@/global.css';

import { PortalHost } from '@rn-primitives/portal';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useSession } from '@/api/session';
import { WebPhoneFrame } from '@/components/shell/web-phone-frame';
import { ToastHost } from '@/components/toast-host';
import { useInterFont } from '@/hooks/use-inter-font';
import { useWebColorSchemeSync } from '@/hooks/use-web-color-scheme-sync';
import { bootApp } from '@/lib/app-boot';
import { installNumberFormatToParts } from '@/lib/intl-polyfill';
import { getQueryClient } from '@/lib/query-client';
import { installReactQueryNative } from '@/lib/react-query-native';
import { NAV_THEME } from '@/lib/theme';
import { installWidgetSync } from '@/widgets/widget-sync';

// Hermes on iOS lacks NumberFormat.formatToParts, which the money formatting needs.
installNumberFormatToParts();
installReactQueryNative();
// Signing out clears the home screen widgets at once (Android).
installWidgetSync();

SplashScreen.preventAutoHideAsync();

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useInterFont();
  const [booted, setBooted] = useState(false);
  const { status } = useSession();
  const { colorScheme } = useColorScheme();
  useWebColorSchemeSync();

  // Behind the splash: restore the stored session (one refresh, then /users/me) and the stored
  // account pick, so the first screen is the right one and already knows both.
  useEffect(() => {
    let live = true;
    bootApp().finally(() => {
      if (live) setBooted(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const ready = (fontsLoaded || !!fontError) && booted && status !== 'restoring';

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const signedIn = status === 'signedIn';
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <QueryClientProvider client={getQueryClient()}>
      <ThemeProvider value={NAV_THEME[scheme]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <WebPhoneFrame>
          <Stack screenOptions={{ headerShown: false }}>
            {/* The route guard is the only navigation on sign-in and sign-out. */}
            <Stack.Protected guard={signedIn} redirectTo="/login">
              <Stack.Screen name="(app)" />
            </Stack.Protected>
            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
          </Stack>
          <ToastHost />
          {/* Overlays (dialogs, selects, popovers, tooltips) render here, so it stays last. */}
          <PortalHost />
        </WebPhoneFrame>
      </ThemeProvider>
    </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
