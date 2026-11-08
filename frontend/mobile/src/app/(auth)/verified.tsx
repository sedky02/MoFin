import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { authApi } from '@/api/client';
import { startSession } from '@/api/session';
import { forgetPendingSignup, pendingSignupFor } from '@/lib/pending-signup';

/**
 * Opened from the web page that verified the email (mofin://verified?email=…). Signs in with the
 * sign-up still kept in memory; if the app was closed meanwhile, sign-in opens with the email filled.
 */
export default function VerifiedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === 'string' ? params.email : '';

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = pendingSignupFor(email);
      if (pending) {
        try {
          const tokens = await authApi.login(pending);
          forgetPendingSignup();
          // The root route guard leaves the auth screens once the session starts.
          await startSession(tokens);
          return;
        } catch {
          // Falls through to the sign-in screen.
        }
      }
      if (!cancelled) router.replace({ pathname: '/login', params: { email, verified: '1' } });
    })();
    return () => {
      cancelled = true;
    };
  }, [email, router]);

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator accessibilityLabel="Signing you in" />
    </View>
  );
}
