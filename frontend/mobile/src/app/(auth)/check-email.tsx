import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { AppState, Linking, View } from 'react-native';

import { ApiClientError, authApi } from '@/api/client';
import { startSession } from '@/api/session';
import { AuthChip } from '@/components/auth/auth-chip';
import { AuthMailScene } from '@/components/auth/auth-scenes';
import { AuthScreen } from '@/components/auth/auth-screen';
import { Notice } from '@/components/auth/notice';
import { SubmitButton } from '@/components/auth/submit-button';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { AUTH_COPY } from '@/lib/auth-forms';
import { Check, Clock, Mail } from '@/lib/icons';
import { forgetPendingSignup, pendingSignupFor } from '@/lib/pending-signup';

const RESEND_COOLDOWN_S = 60;

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

  const [cooldown, setCooldown] = React.useState(fromSignIn ? 0 : RESEND_COOLDOWN_S);
  const [resending, setResending] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [feedback, setFeedback] = React.useState<Feedback>(null);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

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
      setCooldown(RESEND_COOLDOWN_S);
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
          {fromSignIn ? 'Verify your email to sign in. ' : ''}We sent an email to{' '}
          <Text className="text-sm font-semibold text-foreground">{email || 'your address'}</Text>. Open the link in it
          to finish setting up your account.
        </Text>
      }>
      <View className="flex-row flex-wrap justify-center gap-2.5">
        <AuthChip icon={Clock}>Expires in 24 hours</AuthChip>
        <AuthChip icon={Check}>Works once</AuthChip>
      </View>
      <Text className="mt-6 text-center text-sm leading-6 text-muted-foreground">
        The link opens the MoFin website. Tap “Open the MoFin app” there and you&apos;ll be signed in here.
      </Text>

      <View className="mt-5">
        {feedback === 'resent' ? <Notice kind="success">We sent a new link.</Notice> : null}
        {feedback === 'limited' ? <Notice kind="error">{AUTH_COPY.rateLimitedForgot}</Notice> : null}
        {feedback === 'failed' ? <Notice kind="error">Couldn&apos;t send it. Try again.</Notice> : null}
        {feedback === 'notYet' ? (
          <Notice kind="info">Your email isn&apos;t verified yet. Open the link in the email first.</Notice>
        ) : null}
      </View>

      <View className="mt-4 gap-3.5">
        <SubmitButton
          pending={false}
          pendingText=""
          leading={<Icon as={Mail} size={18} className="text-primary-foreground" />}
          onPress={() => void Linking.openURL('mailto:')}>
          Open email app
        </SubmitButton>
        <SubmitButton variant="outline" pending={checking} pendingText="Checking…" onPress={continueAfterVerifying}>
          I&apos;ve verified my email
        </SubmitButton>
        <Button variant="ghost" className="min-h-11" disabled={!email || cooldown > 0 || resending} onPress={resend}>
          <Text className="text-[15px] font-semibold text-muted-foreground">
            {resending ? 'Sending…' : cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend email'}
          </Text>
        </Button>
        <Button variant="ghost" className="min-h-11" onPress={() => router.replace('/register')}>
          <Text className="text-[15px] font-semibold text-muted-foreground">Use a different email</Text>
        </Button>
      </View>
    </AuthScreen>
  );
}
