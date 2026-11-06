import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import { ApiClientError, authApi } from '@/api/client';
import { AuthScreen } from '@/components/auth/auth-screen';
import { FormField } from '@/components/auth/form-field';
import { Notice } from '@/components/auth/notice';
import { SubmitButton } from '@/components/auth/submit-button';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { handleApiError } from '@/core/form-errors';
import { AUTH_COPY, forgotSchema, type ForgotValues } from '@/lib/auth-forms';

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
      <AuthScreen title="Check your email">
        <Text role="status" className="-mt-4 text-sm leading-6 text-muted-foreground">
          If an account exists for <Text className="text-sm font-medium">{sentTo}</Text>, we have sent it a link to
          reset the password. The link works once and expires in 30 minutes.
        </Text>
        <Text className="mt-3 text-sm leading-6 text-muted-foreground">
          The link opens the MoFin website, where you choose the new password. Then come back here and sign in.
        </Text>
        <Text className="mt-3 text-sm leading-6 text-muted-foreground">
          Nothing arrived? Check your spam folder, or try again in a few minutes.
        </Text>
        <View className="mt-6 gap-3">
          <SubmitButton pending={false} pendingText="" onPress={() => router.replace('/login')}>
            Back to sign in
          </SubmitButton>
          <Button
            variant="ghost"
            className="min-h-11"
            onPress={() => {
              setSentTo(null);
              form.reset({ email: '' });
            }}>
            <Text className="text-sm">Use a different email</Text>
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

      <View className="gap-4">
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
        <SubmitButton pending={isSubmitting} pendingText="Sending link…" onPress={() => onSubmit()}>
          Send reset link
        </SubmitButton>
      </View>

      <Text className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-primary-text">
          Back to sign in
        </Link>
      </Text>
    </AuthScreen>
  );
}
