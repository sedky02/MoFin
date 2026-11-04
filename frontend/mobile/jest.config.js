module.exports = {
  preset: 'jest-expo',
  globalSetup: '<rootDir>/jest.global-setup.js',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // jest-expo only transforms .js/.ts, and lucide's React Native entry is an .mjs file.
    '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
    // The per-icon files that src/lib/icons.ts re-exports (scripts/sync-icons.mjs).
    '^lucide-react-native/icons/(.*)$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',
  },
  // jest-expo's default list, plus the packages this app adds that ship untranspiled code.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|react-native-svg|nativewind|react-native-css-interop|@rn-primitives/.*|lucide-react-native)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
