import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Linking, View } from 'react-native';

import { ApiClientError, authApi } from '@/api/client';
import { AuthMailScene } from '@/components/auth/auth-scenes';
import { AuthScreen } from '@/components/auth/auth-screen';
import { FormField } from '@/components/auth/form-field';
import { Notice } from '@/components/auth/notice';
import { SentAddressCard, resendLabel, useCooldown } from '@/components/auth/sent-address-card';
import { SubmitButton } from '@/components/auth/submit-button';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { handleApiError } from '@/core/form-errors';
import { AUTH_COPY, forgotSchema, type ForgotValues } from '@/lib/auth-forms';
import { Mail } from '@/lib/icons';

// The emailed link opens the MoFin website's reset page (the backend builds it from the web URL),
// where the new password is chosen. The app has no reset screen of its own.
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [rateLimited, setRateLimited] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [resending, setResending] = React.useState(false);
  const [feedback, setFeedback] = React.useState<'resent' | 'limited' | 'failed' | null>(null);
  const cooldown = useCooldown(0);

  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });
  const { isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setRateLimited(false);
    try {
      await authApi.forgotPassword({ email });
      setSentTo(email);
      cooldown.restart();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 429) {
        setRateLimited(true);
        return;
      }
      handleApiError(err, { setError: form.setError, fallback: AUTH_COPY.forgotFailed });
    }
  });

  async function sendAgain() {
    if (!sentTo) return;
    setResending(true);
    setFeedback(null);
    try {
      await authApi.forgotPassword({ email: sentTo });
      setFeedback('resent');
      cooldown.restart();
    } catch (err) {
      setFeedback(err instanceof ApiClientError && err.status === 429 ? 'limited' : 'failed');
    } finally {
      setResending(false);
    }
  }

  if (sentTo) {
    return (
      <AuthScreen
        centered
        scene={<AuthMailScene />}
        title="Check your"
        accent="email"
        subtitle={
          <Text role="status" className="text-sm leading-6 text-muted-foreground">
            If an account exists for this email, we sent it a reset link:
          </Text>
        }>
        <SentAddressCard
          email={sentTo}
          meta="Expires in 30 minutes · works once"
          onChange={() => {
            setSentTo(null);
            setFeedback(null);
            form.reset({ email: sentTo });
          }}
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
            disabled={cooldown.seconds > 0 || resending}
            onPress={sendAgain}>
            {resendLabel('Send again', resending, cooldown.seconds)}
          </SubmitButton>
        </View>

        <View className="mt-4">
          {feedback === 'resent' ? <Notice kind="success">We sent a new link. It replaces the old one.</Notice> : null}
          {feedback === 'limited' ? <Notice kind="error">{AUTH_COPY.rateLimitedForgot}</Notice> : null}
          {feedback === 'failed' ? <Notice kind="error">{AUTH_COPY.forgotFailed}</Notice> : null}
        </View>

        <Text className="text-center text-[13px] leading-5 text-muted-foreground">
          The link opens the MoFin website, where you choose the new password. Then come back and sign in.
        </Text>

        <Button variant="ghost" className="mt-4 min-h-11" onPress={() => router.replace('/login')}>
          <Text className="text-[15px] font-semibold text-primary-text">Back to sign in</Text>
        </Button>
      </AuthScreen>
    );
  }


  return (
    <AuthScreen
      title="Forgot your"
      accent="password?"
      subtitle="Enter the email you sign in with and we'll send you a link to choose a new one.">
      {rateLimited ? <Notice kind="error">{AUTH_COPY.rateLimitedForgot}</Notice> : null}

      <View className="gap-6">
        <FormField
          control={form.control}
          name="email"
          label="Email"
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          returnKeyType="send"
          onSubmitEditing={() => onSubmit()}
        />
        <SubmitButton arrow pending={isSubmitting} pendingText="Sending link…" onPress={() => onSubmit()}>
          Send reset link
        </SubmitButton>
      </View>

      <Text className="mt-8 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-semibold text-primary-text">
          Back to sign in
        </Link>
      </Text>
    </AuthScreen>
  );
}
