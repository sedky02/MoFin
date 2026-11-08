import * as React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ApiClientError, authApi } from '@/api/client';
import { getGoogleIdToken, googleAvailability, GOOGLE_MESSAGES } from '@/api/google';
import { startSession } from '@/api/session';
import { Notice } from '@/components/auth/notice';
import { SubmitButton } from '@/components/auth/submit-button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { AUTH_COPY, DEMO_NOTICES, demoNoticeFor } from '@/lib/auth-forms';
import { Sparkles } from '@/lib/icons';

type Pending = 'google' | 'demo' | null;

function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48" aria-hidden>
      <Path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <Path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <Path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </Svg>
  );
}

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
    <View className="gap-3.5">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <SubmitButton
        variant="outline"
        leading={<GoogleLogo />}
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
          className="min-h-11"
          leading={<Icon as={Sparkles} size={16} className="text-muted-foreground" />}
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
