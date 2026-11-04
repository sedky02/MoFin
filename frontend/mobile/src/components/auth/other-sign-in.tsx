import * as React from 'react';
import { View } from 'react-native';

import { ApiClientError, authApi } from '@/api/client';
import { getGoogleIdToken, googleAvailability, GOOGLE_MESSAGES } from '@/api/google';
import { startSession } from '@/api/session';
import { Notice } from '@/components/auth/notice';
import { SubmitButton } from '@/components/auth/submit-button';
import { Text } from '@/components/ui/text';
import { AUTH_COPY, DEMO_NOTICES, demoNoticeFor } from '@/lib/auth-forms';

type Pending = 'google' | 'demo' | null;

/**
 * Google sign-in and "Try the demo", under the email form. Both end in startSession(tokens); the
 * root layout's route guard then shows the app. Failures show a banner here.
 */
export function OtherSignIn({ googleLabel = 'Continue with Google', showDemo = true }: { googleLabel?: string; showDemo?: boolean }) {
  const [pending, setPending] = React.useState<Pending>(null);
  const [error, setError] = React.useState<string | null>(null);
  const google = React.useMemo(() => googleAvailability(), []);

  async function onGoogle() {
    setError(null);
    setPending('google');
    try {
      const result = await getGoogleIdToken();
      if (result.kind === 'cancelled') return;
      const tokens = await authApi.googleIdToken(result.idToken);
      await startSession(tokens);
    } catch (err) {
      // Development builds only: shows the real cause in the Metro terminal (the banner stays generic).
      if (__DEV__) console.warn('[google sign-in]', err);
      if (err instanceof ApiClientError && err.status === 429) setError(AUTH_COPY.rateLimited);
      else if (err instanceof ApiClientError && err.status === 503) setError(GOOGLE_MESSAGES.unconfigured);
      else setError(GOOGLE_MESSAGES.failed);
    } finally {
      setPending(null);
    }
  }

  async function onDemo() {
    setError(null);
    setPending('demo');
    try {
      const demo = await authApi.demo();
      await startSession({ accessToken: demo.accessToken, refreshToken: demo.refreshToken });
    } catch (err) {
      setError(DEMO_NOTICES[demoNoticeFor(err)]);
    } finally {
      setPending(null);
    }
  }

  return (
    <View className="gap-3">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <SubmitButton
        variant="outline"
        pending={pending === 'google'}
        pendingText="Opening Google…"
        disabled={!google.available || pending !== null}
        accessibilityHint={google.available ? undefined : google.reason}
        onPress={onGoogle}>
        {googleLabel}
      </SubmitButton>
      {!google.available ? <Text className="text-center text-xs text-muted-foreground">{google.reason}</Text> : null}
      {showDemo ? (
        <SubmitButton
          variant="ghost"
          pending={pending === 'demo'}
          pendingText="Starting the demo…"
          disabled={pending !== null}
          onPress={onDemo}>
          Try the demo
        </SubmitButton>
      ) : null}
    </View>
  );
}
