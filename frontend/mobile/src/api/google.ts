// Native Google sign-in (@react-native-google-signin/google-signin). It needs the app's development
// build: the native module is missing from Expo Go, and the package has no web sign-in. Importing it
// where the module is missing throws, so it is required lazily, inside try/catch, and only on a
// platform that can have it. The ID token it returns goes to POST /auth/google/id-token, which
// verifies it before signing anyone in.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { config } from '@/config';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

export type GoogleAvailability = { available: true } | { available: false; reason: string };

export const GOOGLE_MESSAGES = {
  // Copy shared with the web (frontend/web/lib/auth-feedback.ts).
  failed: "Google sign-in didn't finish — try again or use email.",
  unconfigured: "Google sign-in isn't available right now — sign in with email instead.",
  web: 'Google sign-in works in the MoFin app. Here, use your email instead.',
  needsBuild: 'Google sign-in needs the MoFin app build, not Expo Go. Use your email instead.',
} as const;

let cached: GoogleModule | null | undefined;
let configured = false;

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

function loadModule(): GoogleModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web' || isExpoGo()) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    cached = null; // a build without the native module
  }
  return cached;
}

/** Whether the Google button can work here, and if not, the message to show instead. */
export function googleAvailability(): GoogleAvailability {
  if (Platform.OS === 'web') return { available: false, reason: GOOGLE_MESSAGES.web };
  if (isExpoGo()) return { available: false, reason: GOOGLE_MESSAGES.needsBuild };
  if (!config.googleWebClientId) return { available: false, reason: GOOGLE_MESSAGES.unconfigured };
  if (!loadModule()) return { available: false, reason: GOOGLE_MESSAGES.needsBuild };
  return { available: true };
}

export type GoogleResult = { kind: 'ok'; idToken: string } | { kind: 'cancelled' };

/** Opens Google's account picker. Resolves with the ID token, or `cancelled` if the user backed out. */
export async function getGoogleIdToken(): Promise<GoogleResult> {
  const mod = loadModule();
  if (!mod || !config.googleWebClientId) throw new Error('Google sign-in is not available in this build.');
  const { GoogleSignin, isCancelledResponse, isErrorWithCode, statusCodes } = mod;
  if (!configured) {
    // The web client ID makes Google issue an ID token whose audience the backend accepts. The iOS
    // client ID is added once it exists (EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID).
    GoogleSignin.configure({
      webClientId: config.googleWebClientId,
      ...(config.googleIosClientId ? { iosClientId: config.googleIosClientId } : {}),
    });
    configured = true;
  }
  try {
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (isCancelledResponse(res)) return { kind: 'cancelled' };
    const idToken = res.data.idToken;
    if (!idToken) throw new Error('Google returned no ID token.');
    return { kind: 'ok', idToken };
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) return { kind: 'cancelled' };
    throw err;
  }
}

/** Forgets the Google account choice so the next sign-in shows the picker again. Never throws. */
export async function googleSignOut(): Promise<void> {
  if (!cached || !configured) return;
  try {
    await cached.GoogleSignin.signOut();
  } catch {
    /* nothing to forget */
  }
}

/** Test helper. */
export function resetGoogleForTests(): void {
  cached = undefined;
  configured = false;
}
