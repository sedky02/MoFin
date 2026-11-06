// React Query takes online and focus signals from the browser; on a phone they come from NetInfo
// and AppState, so paused queries resume when the network returns.
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
