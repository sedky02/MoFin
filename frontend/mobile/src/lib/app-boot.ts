// What runs behind the splash screen, and what every session end does to the app's state.
import { googleSignOut } from '@/api/google';
import { onSessionEnd, restoreSession } from '@/api/session';
import { userKeys } from '@/core/query-keys';
import { loadThemePreference } from '@/hooks/use-theme-preference';
import { loadActiveAccount } from '@/hooks/useActiveAccount';
import { getQueryClient } from '@/lib/query-client';

let sessionEffectsInstalled = false;

/**
 * On every sign-out or rejected refresh: drop every cached query (another user may sign in next)
 * and forget the Google account choice. The stored active-account pick is kept on purpose: it only
 * pre-fills fields, and an id from another user's account resolves to nothing.
 */
export function installSessionEffects(): void {
  if (sessionEffectsInstalled) return;
  sessionEffectsInstalled = true;
  onSessionEnd(() => {
    const queryClient = getQueryClient();
    void queryClient.cancelQueries();
    queryClient.clear();
    void googleSignOut();
  });
}

/**
 * Restores the stored session (one refresh, then /users/me, seeded into the cache under the same
 * key `useUser` reads) and loads the stored account pick and theme preference. Never rejects: the splash must always end.
 */
export async function bootApp(): Promise<void> {
  installSessionEffects();
  await Promise.allSettled([
    restoreSession().then(({ user }) => {
      if (user) getQueryClient().setQueryData(userKeys.me, user);
    }),
    loadActiveAccount(),
    loadThemePreference(),
  ]);
}
