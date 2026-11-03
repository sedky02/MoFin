import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { tokenStore } from '@/api/token-store';
import { bootApp } from '@/lib/app-boot';

jest.mock('@/api/session', () => ({
  ...jest.requireActual('@/api/session'),
  restoreSession: jest.fn(async () => ({ user: null })),
}));
jest.mock('@/api/google', () => ({ googleSignOut: jest.fn(async () => {}) }));

const secure = SecureStore as unknown as { __store: Map<string, string> };

beforeEach(async () => {
  await AsyncStorage.clear();
  secure.__store.clear();
});

describe('bootApp on a fresh install', () => {
  it('drops a token the Keychain kept from an earlier install, once', async () => {
    await tokenStore.setRefreshToken('old-install-token');
    await bootApp();
    expect(await tokenStore.getRefreshToken()).toBeNull();
    expect(await AsyncStorage.getItem('mofin-installed')).toBe('1');
  });

  it('keeps the token on every later launch', async () => {
    await AsyncStorage.setItem('mofin-installed', '1');
    await tokenStore.setRefreshToken('current-token');
    await bootApp();
    expect(await tokenStore.getRefreshToken()).toBe('current-token');
  });
});

describe('token store', () => {
  it('stores the token for this device only, readable while unlocked', async () => {
    await tokenStore.setRefreshToken('t');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('mofin.refreshToken', 't', {
      keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    });
  });
});
