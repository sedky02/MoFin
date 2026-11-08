import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { AppState, Linking, View } from 'react-native';

import { ApiClientError, authApi } from '@/api/client';
import { startSession } from '@/api/session';
import { AuthMailScene } from '@/components/auth/auth-scenes';
import { AuthScreen } from '@/components/auth/auth-screen';
import { Notice } from '@/components/auth/notice';
import { RESEND_COOLDOWN_S, SentAddressCard, resendLabel, useCooldown } from '@/components/auth/sent-address-card';
import { SubmitButton } from '@/components/auth/submit-button';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { AUTH_COPY } from '@/lib/auth-forms';
import { Mail } from '@/lib/icons';
import { forgetPendingSignup, pendingSignupFor } from '@/lib/pending-signup';

type Feedback = 'resent' | 'limited' | 'failed' | 'notYet' | null;

/**
 * Waits for the emailed link. The link verifies on the MoFin website and offers to come back here;
 * whenever the app returns to the foreground it tries to sign in with the credentials kept in memory.
 */
export default function CheckEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; reason?: string }>();
  const email = typeof params.email === 'string' ? params.email : '';
  const fromSignIn = params.reason === 'signin';

  const cooldown = useCooldown(fromSignIn ? 0 : RESEND_COOLDOWN_S);
  const [resending, setResending] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [feedback, setFeedback] = React.useState<Feedback>(null);

  /** Resolves true once signed in; the root route guard then leaves the auth screens. */
  const trySignIn = React.useCallback(async (): Promise<boolean> => {
    const pending = pendingSignupFor(email);
    if (!pending) return false;
    try {
      const tokens = await authApi.login(pending);
      forgetPendingSignup();
      await startSession(tokens);
      return true;
    } catch {
      return false;
    }
  }, [email]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void trySignIn();
    });
    return () => subscription.remove();
  }, [trySignIn]);

  async function resend() {
    setResending(true);
    setFeedback(null);
    try {
      await authApi.resendVerification({ email });
      setFeedback('resent');
      cooldown.restart();
    } catch (err) {
      setFeedback(err instanceof ApiClientError && err.status === 429 ? 'limited' : 'failed');
    } finally {
      setResending(false);
    }
  }

  async function continueAfterVerifying() {
    if (!pendingSignupFor(email)) {
      router.replace({ pathname: '/login', params: { email } });
      return;
    }
    setChecking(true);
    setFeedback(null);
    const signedIn = await trySignIn();
    setChecking(false);
    if (!signedIn) setFeedback('notYet');
  }

  return (
    <AuthScreen
      centered
      scene={<AuthMailScene />}
      title="Check your"
      accent="email"
      subtitle={
        <Text role="status" className="text-sm leading-6 text-muted-foreground">
          {fromSignIn ? 'Verify your email to sign in. We sent a link to:' : 'We sent a verification link to:'}
        </Text>
      }>
      <SentAddressCard
        email={email}
        meta="Expires in 24 hours · works once"
        onChange={() => router.replace('/register')}
      />

      <View className="mt-7 gap-3">
        <SubmitButton
          pending={false}
          pendingText=""
          leading={<Icon as={Mail} size={18} className="text-primary-foreground" />}
          onPress={() => void Linking.openURL('mailto:')}>
          Open email app
        </SubmitButton>
        <SubmitButton
          variant="outline"
          pending={false}
          pendingText=""
          disabled={!email || cooldown.seconds > 0 || resending}
          onPress={resend}>
          {resendLabel('Resend email', resending, cooldown.seconds)}
        </SubmitButton>
      </View>

      <View className="mt-4">
        {feedback === 'resent' ? <Notice kind="success">We sent a new link. It replaces the old one.</Notice> : null}
        {feedback === 'limited' ? <Notice kind="error">{AUTH_COPY.rateLimitedForgot}</Notice> : null}
        {feedback === 'failed' ? <Notice kind="error">Couldn&apos;t send it. Try again.</Notice> : null}
        {feedback === 'notYet' ? (
          <Notice kind="info">Your email isn&apos;t verified yet. Open the link in the email first.</Notice>
        ) : null}
      </View>

      <Text className="text-center text-[13px] leading-5 text-muted-foreground">
        The link opens the MoFin website. Tap “Open the MoFin app” there and you&apos;ll be signed in here.
      </Text>

      <Button variant="ghost" className="mt-4 min-h-11" disabled={checking} onPress={continueAfterVerifying}>
        <Text className="text-[15px] font-semibold text-primary-text">
          {checking ? 'Checking…' : 'I’ve verified my email'}
        </Text>
      </Button>
    </AuthScreen>
  );
}
