// Decisions apart from expo-notifications so they test as plain functions.
export type PermissionState = { status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean };

/** Ask once, right after the first sign-in on this phone; after that only the settings screen asks. */
export function shouldRequestPermission(permission: PermissionState, alreadyAsked: boolean): boolean {
  return permission.status === 'undetermined' && permission.canAskAgain && !alreadyAsked;
}

export type PushStatus = 'on' | 'blocked' | 'off';

export function pushStatus(permission: PermissionState): PushStatus {
  if (permission.status === 'granted') return 'on';
  return permission.status === 'denied' && !permission.canAskAgain ? 'blocked' : 'off';
}

/** The in-app path a notification carries; anything else is ignored, never trusted as a route. */
export function notificationUrl(data: unknown): string | undefined {
  const url = (data as { url?: unknown } | null | undefined)?.url;
  return typeof url === 'string' && url.startsWith('/') ? url : undefined;
}
