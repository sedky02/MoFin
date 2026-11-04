import type { ExpoConfig } from 'expo/config';

// App identity: committed, not environment. The Google OAuth clients are tied to these strings.
// Environment values (API URL, public client IDs) live in .env, see .env.example and src/config.ts.
const config: ExpoConfig = {
  name: 'MoFin',
  slug: 'mofin',
  owner: 'sedky02',
  version: '1.0.0',
  scheme: 'mofin',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  // Status bar: expo-status-bar in the root layout follows the theme (light icons on dark).
  ios: {
    bundleIdentifier: 'com.sedky02.mofin',
    supportsTablet: true,
  },
  android: {
    package: 'com.sedky02.mofin',
    adaptiveIcon: {
      backgroundColor: '#D7F205', // the brand lime, behind the bars (the adaptive background image is the same colour)
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Exports go to the cache folder and the share sheet, so no storage permission is needed, and the
    // overlay permission has no use here. (INTERNET and VIBRATE stay: the API and haptics.)
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    // Adds the Android backup rules that keep the stored session out of cloud backups and device transfers.
    'expo-secure-store',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#fafaf9',
        dark: { backgroundColor: '#050505' },
        image: './assets/images/splash-icon.png',
        imageWidth: 144,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    // The id `eas init` printed for @sedky02/mofin. It is an identifier, not a secret, so it is committed.
    eas: { projectId: "2b264808-719e-4df5-b114-e7d9be34554b" },
  },
};

export default config;
