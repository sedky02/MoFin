import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/** React Query's view of connectivity (NetInfo on a phone, see src/lib/react-query-native.ts). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}
