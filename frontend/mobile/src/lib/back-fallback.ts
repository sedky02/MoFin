import type { Href } from 'expo-router';

/**
 * Where a stack screen's back button goes when there is no history to go back to: a page opened
 * from a link or reloaded in the browser. Each screen goes to the place it is normally opened from.
 */
export function backFallbackHref(routeName: string, params?: Record<string, unknown>): Href {
  if (routeName === 'transactions/[id]/edit' && typeof params?.id === 'string') {
    return { pathname: '/transactions/[id]', params: { id: params.id } };
  }
  // The add sheet closes onto the dashboard (where + is used most), like saving with no history.
  if (routeName === 'transactions/new') return '/dashboard';
  if (routeName.startsWith('transactions/')) return '/transactions';
  if (routeName.startsWith('settings/') && routeName !== 'settings/index') return '/settings';
  return '/more';
}
