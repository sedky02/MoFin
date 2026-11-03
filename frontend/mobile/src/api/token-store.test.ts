import * as SecureStore from 'expo-secure-store';

import { tokenStore } from '@/api/token-store';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
});

describe('tokenStore (native backend)', () => {
  it('round-trips the refresh token through SecureStore with this-device-only access', async () => {
    await tokenStore.setRefreshToken('r1');
    expect(await tokenStore.getRefreshToken()).toBe('r1');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('mofin.refreshToken', 'r1', { keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' });
  });

  it('uses a key SecureStore accepts', () => {
    return tokenStore.setRefreshToken('r').then(() => {
      const key = (SecureStore.setItemAsync as jest.Mock).mock.calls[0][0] as string;
      expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
    });
  });

  it('a clear queued right after a slow save still lands last, so a signed-out device keeps nothing', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockImplementationOnce(
      (k: string, v: string) => new Promise<void>((resolve) => setTimeout(() => { store.set(k, v); resolve(); }, 20)),
    );
    const save = tokenStore.setRefreshToken('late');
    const clear = tokenStore.clear();
    await Promise.all([save, clear]);
    expect(await tokenStore.getRefreshToken()).toBeNull();
  });

  it('keeps working after one operation fails', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain locked'));
    await expect(tokenStore.getRefreshToken()).rejects.toThrow('keychain locked');
    await tokenStore.setRefreshToken('r2');
    expect(await tokenStore.getRefreshToken()).toBe('r2');
  });
});
