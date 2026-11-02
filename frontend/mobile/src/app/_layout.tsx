import '@/global.css';

import { PortalHost } from '@rn-primitives/portal';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { useEffect } from 'react';

import { useInterFont } from '@/hooks/use-inter-font';
import { useWebColorSchemeSync } from '@/hooks/use-web-color-scheme-sync';
import { NAV_THEME } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useInterFont();
  const { colorScheme } = useColorScheme();
  useWebColorSchemeSync();

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  return (
    <ThemeProvider value={NAV_THEME[scheme]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
      {/* Overlays (dialogs, selects, popovers, tooltips) render here, so it stays last. */}
      <PortalHost />
    </ThemeProvider>
  );
}
