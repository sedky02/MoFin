// The one place environment values are read. Metro inlines `process.env.EXPO_PUBLIC_*` only when
// it is written out in full like this, so don't turn these into dynamic lookups.
const apiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!apiUrl) {
  throw new Error('EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env and restart Expo.');
}

export const config = {
  /** Backend base URL including `/api/v1`, no trailing slash. */
  apiUrl: apiUrl.replace(/\/+$/, ''),
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
} as const;
