module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  // jest-expo's default list, plus the packages this app adds that ship untranspiled code.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|react-native-svg|nativewind|react-native-css-interop|@rn-primitives/.*|lucide-react-native)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
