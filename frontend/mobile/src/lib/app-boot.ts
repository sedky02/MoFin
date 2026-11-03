// What runs behind the splash screen, and what every session end does to the app's state.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { googleSignOut } from '@/api/google';
import { onSessionEnd, restoreSession } from '@/api/session';
import { tokenStore } from '@/api/token-store';
import { clearExportCache } from '@/components/settings/save-export';
import { userKeys } from '@/core/query-keys';
import { loadThemePreference } from '@/hooks/use-theme-preference';
import { clearActiveAccount, loadActiveAccount } from '@/hooks/useActiveAccount';
import { getQueryClient } from '@/lib/query-client';

let sessionEffectsInstalled = false;

/**
 * On every sign-out or rejected refresh: drop every cached query (another user may sign in next)
 * and forget the Google account choice, the stored active-account pick and any exported file left in
 * the cache (another user may sign in on this device next).
 */
export function installSessionEffects(): void {
  if (sessionEffectsInstalled) return;
  sessionEffectsInstalled = true;
  onSessionEnd(() => {
    const queryClient = getQueryClient();
    void queryClient.cancelQueries();
    queryClient.clear();
    void googleSignOut();
    clearActiveAccount();
    clearExportCache();
  });
}

/**
 * Restores the stored session (one refresh, then /users/me, seeded into the cache under the same
 * key `useUser` reads) and loads the stored account pick and theme preference. Never rejects: the splash must always end.
 */
const INSTALL_MARKER = 'mofin-installed';

/**
 * The iOS Keychain survives an uninstall, so a reinstalled app would silently resume an old
 * session. App storage does not survive it: no marker means a fresh install, so drop any token.
 */
async function dropTokenOnFreshInstall(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(INSTALL_MARKER)) return;
    await tokenStore.clear();
    await AsyncStorage.setItem(INSTALL_MARKER, '1');
  } catch {
    /* storage unavailable: keep whatever session exists */
  }
}

export async function bootApp(): Promise<void> {
  installSessionEffects();
  await dropTokenOnFreshInstall();
  await Promise.allSettled([
    restoreSession().then(({ user }) => {
      if (user) getQueryClient().setQueryData(userKeys.me, user);
    }),
    loadActiveAccount(),
    loadThemePreference(),
  ]);
}
