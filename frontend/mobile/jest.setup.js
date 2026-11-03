// A fixed, unreachable API URL: tests mock fetch and must never reach the real backend.
process.env.EXPO_PUBLIC_API_URL = 'https://api.test/api/v1';
process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'test-web-client.apps.googleusercontent.com';

// AsyncStorage has native code; use its in-memory mock in every test.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// SecureStore (Keychain / Keystore): an in-memory map. Tests read `__store` to check what is persisted.
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
  };
});

jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));
