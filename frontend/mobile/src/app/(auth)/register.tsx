import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';

import { ApiClientError, authApi } from '@/api/client';
import { AuthScreen, OrDivider } from '@/components/auth/auth-screen';
import { FormField, type TextFieldHandle } from '@/components/auth/form-field';
import { Notice } from '@/components/auth/notice';
import { OtherSignIn } from '@/components/auth/other-sign-in';
import { SubmitButton } from '@/components/auth/submit-button';
import { Text } from '@/components/ui/text';
import { handleApiError } from '@/core/form-errors';
import { scorePassword } from '@/core/password-strength';
import { AUTH_COPY, registerSchema, STRENGTH, type RegisterValues } from '@/lib/auth-forms';
import { cn } from '@/lib/utils';

export default function RegisterScreen() {
  const router = useRouter();
  const [rateLimited, setRateLimited] = React.useState(false);
  const emailRef = React.useRef<TextFieldHandle>(null);
  const passwordRef = React.useRef<TextFieldHandle>(null);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', displayName: '' },
    mode: 'onTouched',
  });
  const { isSubmitting, errors } = form.formState;
  const password = useWatch({ control: form.control, name: 'password' }) ?? '';
  const strength = scorePassword(password);

  const onSubmit = form.handleSubmit(async (values) => {
    setRateLimited(false);
    try {
      await authApi.register({
        email: values.email,
        password: values.password,
        ...(values.displayName ? { displayName: values.displayName } : {}),
      });
      // No auto-login: the backend answers the same whether or not the email was new.
      router.replace({ pathname: '/login', params: { registered: '1', email: values.email } });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 429) {
        setRateLimited(true);
        return;
      }
      handleApiError(err, { setError: form.setError, fallback: AUTH_COPY.registerFailed });
    }
  });

  return (
    <AuthScreen title="Create your" accent="account" subtitle="Track your money with precision.">
      {rateLimited ? <Notice kind="error">{AUTH_COPY.rateLimited}</Notice> : null}

      <View className="gap-4">
        <FormField
          control={form.control}
          name="displayName"
          label="Display name"
          testID="register-name"
          labelHint="(optional)"
          placeholder="Alex Rivera"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <FormField
          control={form.control}
          name="email"
          label="Email"
          testID="register-email"
          inputRef={emailRef}
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
          testID="register-password"
          password
          inputRef={passwordRef}
          placeholder="At least 8 characters"
          description={errors.password ? undefined : 'Use at least 8 characters.'}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={() => onSubmit()}>
          <View className="mt-1.5 flex-row items-center gap-2">
            <View className="h-1.5 flex-1 flex-row gap-1">
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  className={cn('h-full flex-1 rounded-full', i < strength ? STRENGTH[strength].cls : 'bg-border')}
                />
              ))}
            </View>
            <Text className="w-14 text-right text-xs text-muted-foreground">
              {password ? STRENGTH[strength].label : ''}
            </Text>
          </View>
        </FormField>
        <SubmitButton testID="register-submit" pending={isSubmitting} pendingText="Creating account…" onPress={() => onSubmit()}>
          Create account
        </SubmitButton>
      </View>

      <OrDivider />
      <OtherSignIn googleLabel="Sign up with Google" showDemo={false} />

      <Text className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary-text">
          Sign in
        </Link>
      </Text>
    </AuthScreen>
  );
}
