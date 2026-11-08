import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocalSearchParams } from 'expo-router';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import { ApiClientError, authApi } from '@/api/client';
import { startSession, useSession } from '@/api/session';
import { AuthScreen, OrDivider } from '@/components/auth/auth-screen';
import { FormField, type TextFieldHandle } from '@/components/auth/form-field';
import { Notice } from '@/components/auth/notice';
import { OtherSignIn } from '@/components/auth/other-sign-in';
import { SubmitButton } from '@/components/auth/submit-button';
import { Text } from '@/components/ui/text';
import { handleApiError } from '@/core/form-errors';
import { AUTH_COPY, loginSchema, type LoginValues } from '@/lib/auth-forms';

export default function LoginScreen() {
  const params = useLocalSearchParams<{ registered?: string; email?: string }>();
  const { endReason } = useSession();
  const [rateLimited, setRateLimited] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const passwordRef = React.useRef<TextFieldHandle>(null);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: typeof params.email === 'string' ? params.email : '', password: '' },
  });
  const { isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setRateLimited(false);
    setSubmitted(true);
    try {
      const tokens = await authApi.login({ email: values.email, password: values.password });
      await startSession(tokens);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 429) {
        setRateLimited(true);
        return;
      }
      if (err instanceof ApiClientError && err.status === 401) {
        form.setError('password', { type: 'server', message: AUTH_COPY.incorrect }, { shouldFocus: true });
        return;
      }
      handleApiError(err, { setError: form.setError, fallback: AUTH_COPY.loginFailed });
    }
  });

  const justRegistered = params.registered === '1';
  const expired = endReason === 'expired' && !submitted;

  return (
    <AuthScreen title="Sign in to" accent="MoFin" subtitle="Pick up where you left off.">
      {rateLimited ? <Notice kind="error">{AUTH_COPY.rateLimited}</Notice> : null}
      {justRegistered && !rateLimited ? <Notice kind="success">{AUTH_COPY.registered}</Notice> : null}
      {expired && !justRegistered && !rateLimited ? <Notice kind="info">{AUTH_COPY.expired}</Notice> : null}

      <View className="gap-6">
        <FormField
          control={form.control}
          name="email"
          label="Email"
          testID="login-email"
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <FormField
          control={form.control}
          name="password"
          label="Password"
          labelAction={
            <Link href="/forgot-password" className="text-[13px] font-semibold text-primary-text">
              Forgot password?
            </Link>
          }
          testID="login-password"
          placeholder="Your password"
          password
          inputRef={passwordRef}
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => onSubmit()}
        />
        <SubmitButton testID="login-submit" arrow pending={isSubmitting} pendingText="Signing in…" onPress={() => onSubmit()}>
          Sign in
        </SubmitButton>
      </View>

      <OrDivider />
      <OtherSignIn />

      <Text className="mt-8 text-center text-sm text-muted-foreground">
        New to MoFin?{' '}
        <Link href="/register" className="font-semibold text-primary-text">
          Create an account
        </Link>
      </Text>
    </AuthScreen>
  );
}
