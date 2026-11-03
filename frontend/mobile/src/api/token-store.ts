// Where the refresh token survives an app restart. Native: the Keychain / Keystore through
// expo-secure-store, and nowhere else. Web (the Expo web preview only): SecureStore has no web
// implementation, so it falls back to localStorage, or memory when that is blocked. The access
// token is never stored; it lives in memory in session.ts.
//
// Writes are serialized: a "save the rotated token" that started before a "sign out" finishes
// first, so the delete always lands last and a signed-out device never keeps a token.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// SecureStore keys may only contain letters, digits, ".", "-" and "_".
const KEY = 'mofin.refreshToken';

type Backend = {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
};

const secureBackend: Backend = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (value) => SecureStore.setItemAsync(KEY, value),
  remove: () => SecureStore.deleteItemAsync(KEY),
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
