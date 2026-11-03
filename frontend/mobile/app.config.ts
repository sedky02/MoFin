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
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
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
    // Run `npx eas-cli init` once (needs `eas login`), then replace the line below with the printed
    // project id as a plain string. It is an identifier, not a secret, so it is committed.
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
