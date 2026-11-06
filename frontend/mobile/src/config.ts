// The one place environment values are read. Metro inlines `process.env.EXPO_PUBLIC_*` only when
// it is written out in full like this, so don't turn these into dynamic lookups.
const apiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!apiUrl) {
  throw new Error('EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env and restart Expo.');
}

// A release build only ever talks HTTPS. (Local dev may use http://localhost or a LAN address.)
if (!__DEV__ && !/^https:\/\//i.test(apiUrl)) {
  throw new Error('EXPO_PUBLIC_API_URL must be an https:// URL in a release build.');
}

export const config = {
  apiUrl: apiUrl.replace(/\/+$/, ''),
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
} as const;
