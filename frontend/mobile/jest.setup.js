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
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
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

// Reanimated needs its native module, which jest has none of. A plain View stands in, the animation
// builders are inert, and the hooks return still values.
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const builder = () => {
    const b = new Proxy(() => b, { get: (_t, prop) => (prop === 'build' ? () => ({}) : () => b) });
    return b;
  };
  const anim = new Proxy({}, { get: () => builder() });
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c) => c },
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    FadeIn: builder(), FadeOut: builder(), FadeInDown: builder(), FadeOutDown: builder(),
    SlideInDown: builder(), SlideOutDown: builder(),
    // Hooks run synchronously with no keyboard and no animation.
    useAnimatedKeyboard: () => ({ height: { value: 0 }, state: { value: 0 } }),
    useAnimatedStyle: (fn) => fn(),
    useSharedValue: (value) => ({ value }),
    withSpring: (value) => value,
    withTiming: (value) => value,
    runOnJS: (fn) => fn,
    scheduleOnRN: (fn, ...args) => fn(...args),
    ...anim,
  };
});

// Worklets and gestures need native modules too. Swipes (weeks, months, tabs) become plain wrappers in
// tests; the arrows and tabs they duplicate are what the tests press.
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn, ...args) => fn(...args),
  runOnJS: (fn) => fn,
}));
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children }) => children,
    usePanGesture: () => ({}),
  };
});

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// Haptics have native code; every call is a no-op in tests.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
