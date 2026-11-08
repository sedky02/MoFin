import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Linking, View } from 'react-native';

import { ApiClientError, authApi } from '@/api/client';
import { AuthChip } from '@/components/auth/auth-chip';
import { AuthMailScene } from '@/components/auth/auth-scenes';
import { AuthScreen } from '@/components/auth/auth-screen';
import { FormField } from '@/components/auth/form-field';
import { Notice } from '@/components/auth/notice';
import { SubmitButton } from '@/components/auth/submit-button';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { handleApiError } from '@/core/form-errors';
import { AUTH_COPY, forgotSchema, type ForgotValues } from '@/lib/auth-forms';
import { Check, Clock, Mail } from '@/lib/icons';

// The emailed link opens the MoFin website's reset page (the backend builds it from the web URL),
// where the new password is chosen. The app has no reset screen of its own.
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [rateLimited, setRateLimited] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

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
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 429) {
        setRateLimited(true);
        return;
      }
      handleApiError(err, { setError: form.setError, fallback: AUTH_COPY.forgotFailed });
    }
  });

  if (sentTo) {
    return (
      <AuthScreen
        centered
        scene={<AuthMailScene />}
        title="Check your"
        accent="email"
        subtitle={
          <Text role="status" className="text-sm leading-6 text-muted-foreground">
            If an account exists for <Text className="text-sm font-semibold text-foreground">{sentTo}</Text>, we have
            sent it a link to reset the password.
          </Text>
        }>
        <View className="flex-row flex-wrap justify-center gap-2.5">
          <AuthChip icon={Clock}>Expires in 30 minutes</AuthChip>
          <AuthChip icon={Check}>Works once</AuthChip>
        </View>
        <Text className="mt-6 text-center text-sm leading-6 text-muted-foreground">
          The link opens the MoFin website, where you choose the new password. Then come back here and sign in.
        </Text>
        <Text className="mt-3 text-center text-sm leading-6 text-muted-foreground">
          Nothing arrived? Check your spam folder, or try again in a few minutes.
        </Text>
        <View className="mt-9 gap-3.5">
          <SubmitButton
            arrow
            pending={false}
            pendingText=""
            leading={<Icon as={Mail} size={18} className="text-primary-foreground" />}
            onPress={() => void Linking.openURL('mailto:')}>
            Open email app
          </SubmitButton>
          <SubmitButton variant="outline" pending={false} pendingText="" onPress={() => router.replace('/login')}>
            Back to sign in
          </SubmitButton>
          <Button
            variant="ghost"
            className="min-h-11"
            onPress={() => {
              setSentTo(null);
              form.reset({ email: '' });
            }}>
            <Text className="text-[15px] font-semibold text-muted-foreground">Use a different email</Text>
          </Button>
        </View>
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
