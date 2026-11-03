// React Query's online and focus signals come from the browser by default. On a phone, connectivity
// comes from NetInfo and "focus" is the app returning to the foreground (AppState). Paused queries
// resume when the network is back, which is what recovers the app after airplane mode.
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';

let installed = false;

export function installReactQueryNative(): void {
  if (installed) return;
  installed = true;

  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      // `isConnected` is null while unknown: don't pause queries on a guess.
      setOnline(state.isConnected !== false);
    }),
  );

  // On web, React Query already listens to visibilitychange.
  if (Platform.OS !== 'web') {
    focusManager.setEventListener((setFocused) => {
      const sub = AppState.addEventListener('change', (status: AppStateStatus) => setFocused(status === 'active'));
      return () => sub.remove();
    });
  }
}
