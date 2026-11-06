// Where the refresh token survives a restart: Keychain/Keystore via expo-secure-store on native;
// the Expo web preview falls back to localStorage, since SecureStore has no web implementation.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// SecureStore keys may only contain letters, digits, ".", "-" and "_".
const KEY = 'mofin.refreshToken';

type Backend = {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
};

// Only readable while the phone is unlocked, and never copied to another device through a backup.
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const secureBackend: Backend = {
  get: () => SecureStore.getItemAsync(KEY, OPTIONS),
  set: (value) => SecureStore.setItemAsync(KEY, value, OPTIONS),
  remove: () => SecureStore.deleteItemAsync(KEY, OPTIONS),
};

function webBackend(): Backend {
  let memory: string | null = null;
  const storage = (): Storage | undefined => {
    try {
      return typeof window !== 'undefined' ? window.localStorage : undefined;
    } catch {
      return undefined; // blocked (private mode, sandboxed iframe)
    }
  };
  return {
    async get() {
      try {
        return storage()?.getItem(KEY) ?? memory;
      } catch {
        return memory;
      }
    },
    async set(value) {
      memory = value;
      try {
        storage()?.setItem(KEY, value);
      } catch {
        /* memory only */
      }
    },
    async remove() {
      memory = null;
      try {
        storage()?.removeItem(KEY);
      } catch {
        /* nothing stored */
      }
    },
  };
}

const backend: Backend = Platform.OS === 'web' ? webBackend() : secureBackend;

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op);
  queue = run.catch(() => {});
  return run;
}

export const tokenStore = {
  getRefreshToken: (): Promise<string | null> => enqueue(() => backend.get()),
  setRefreshToken: (value: string): Promise<void> => enqueue(() => backend.set(value)),
  clear: (): Promise<void> => enqueue(() => backend.remove()),
};
