import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as React from 'react';

import { onBeforeSignOut } from '@/api/session';
import { safeDeepLinkPath } from '@/lib/deep-links';

import { notificationUrl } from './push-logic';
import { pushSupported, registerThisDevice, unregisterThisDevice } from './push-registration';

/** While signed in: keeps this phone registered for pushes and opens the screen a tap points to. */
export function usePushRegistration() {
  const router = useRouter();
  const lastResponse = Notifications.useLastNotificationResponse();

  React.useEffect(() => {
    if (!pushSupported) return;
    void registerThisDevice({ ask: true });
    return onBeforeSignOut(unregisterThisDevice);
  }, []);

  React.useEffect(() => {
    if (!lastResponse) return;
    const url = notificationUrl(lastResponse.notification.request.content.data);
    void Notifications.clearLastNotificationResponseAsync();
    if (url) router.push(safeDeepLinkPath(url) as never);
  }, [lastResponse, router]);
}
