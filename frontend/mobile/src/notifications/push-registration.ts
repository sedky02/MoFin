import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { api } from '@/api/client';

import { shouldRequestPermission, type PermissionState } from './push-logic';

const ASKED_KEY = 'push-permission-asked';
const ANDROID_CHANNEL = 'default';

let registeredToken: string | undefined;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export const pushSupported = Platform.OS === 'android' || Platform.OS === 'ios';

export async function readPermission(): Promise<PermissionState> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  return { status, canAskAgain };
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: 'MoFin',
    importance: AndroidImportance.DEFAULT,
  });
}

/** Asks for permission when the phone has never been asked, then registers this install's token. */
export async function registerThisDevice(options: { ask: boolean }): Promise<void> {
  if (!pushSupported) return;
  try {
    // Android 13 shows no prompt until a channel exists.
    await ensureAndroidChannel();
    let permission = await readPermission();
    if (options.ask) {
      const asked = (await AsyncStorage.getItem(ASKED_KEY)) === '1';
      if (shouldRequestPermission(permission, asked)) {
        await AsyncStorage.setItem(ASKED_KEY, '1');
        await Notifications.requestPermissionsAsync();
        permission = await readPermission();
      }
    }
    if (permission.status !== 'granted') return;

    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const { data: expoToken } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.post('/notifications/devices', { expoToken, platform: Platform.OS });
    registeredToken = expoToken;
  } catch {
    // Simulators, offline starts and a missing FCM setup land here; the next launch tries again.
  }
}

export async function unregisterThisDevice(): Promise<void> {
  const token = registeredToken;
  registeredToken = undefined;
  if (!token) return;
  await api.delete(`/notifications/devices/${encodeURIComponent(token)}`);
}

/** The settings screen's button: ask if the system still lets us, otherwise the phone's settings are the only way. */
export async function enablePush(): Promise<void> {
  const permission = await readPermission();
  if (permission.status !== 'granted' && !permission.canAskAgain) {
    await Linking.openSettings();
    return;
  }
  await ensureAndroidChannel();
  if (permission.status !== 'granted') await Notifications.requestPermissionsAsync();
  await registerThisDevice({ ask: false });
}
