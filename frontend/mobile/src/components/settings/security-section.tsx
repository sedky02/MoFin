import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react-native';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';

import { FormField, type TextFieldHandle } from '@/components/auth/form-field';
import { SubmitButton } from '@/components/auth/submit-button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ErrorState } from '@/components/common/states';
import { SettingsRow, SettingsSectionCard } from '@/components/settings/settings-card';
import {
  canChangePassword,
  canSignOutEverywhere,
  changePasswordSchema,
  SECURITY_COPY,
  securityMode,
  type ChangePasswordValues,
} from '@/components/settings/settings-logic';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { handleApiError } from '@/core/form-errors';
import { scorePassword } from '@/core/password-strength';
import { changePassword, signOutEverywhere } from '@/hooks/useSettingsActions';
import { useUser } from '@/hooks/useUser';
import { STRENGTH } from '@/lib/auth-forms';
import { cn } from '@/lib/utils';

/**
 * Security: change password (only for an account that has one) and sign out everywhere (not for a
 * demo, whose single session ends with it). Same rules and copy as the web's SecurityCard.
 */
export function SecuritySection() {
  const { data: user, isLoading, isError, refetch } = useUser();
  const mode = securityMode(user, isLoading);

  if (!isLoading && (isError || !user)) {
    return <ErrorState description="Couldn't load your security settings." onRetry={() => refetch()} />;
  }

  return (
    <SettingsSectionCard
      icon={ShieldCheck}
      title="Security"
      description={mode === 'loading' ? undefined : SECURITY_COPY[mode]}>
      {mode === 'loading' ? (
        <Skeleton aria-busy accessibilityLabel="Loading" className="h-40 w-full" />
      ) : canChangePassword(mode) || canSignOutEverywhere(mode) ? (
        <View>
          {canChangePassword(mode) ? <ChangePasswordForm /> : null}
          {canChangePassword(mode) && canSignOutEverywhere(mode) ? <Separator className="my-6" /> : null}
          {canSignOutEverywhere(mode) ? <SignOutEverywhere /> : null}
        </View>
      ) : null}
    </SettingsSectionCard>
  );
}

const EMPTY: ChangePasswordValues = { currentPassword: '', newPassword: '', confirmPassword: '' };

export function ChangePasswordForm() {
  const newRef = React.useRef<TextFieldHandle>(null);
  const confirmRef = React.useRef<TextFieldHandle>(null);
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: EMPTY,
    mode: 'onTouched',
  });
  const { isSubmitting } = form.formState;
  const newPassword = useWatch({ control: form.control, name: 'newPassword' }) ?? '';
  const strength = scorePassword(newPassword);

  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword: next }) => {
    try {
      await changePassword({ currentPassword, newPassword: next });
      form.reset(EMPTY);
    } catch (err) {
      handleApiError(err, { setError: form.setError, fallback: 'Could not change the password.' });
      // Put the cursor on the field the server refused (e.g. a wrong current password).
      const refused = (['currentPassword', 'newPassword'] as const).find((name) => form.getFieldState(name).error);
      if (refused) form.setFocus(refused);
    }
  });

  return (
    <View className="gap-5">
      <Text role="heading" aria-level={3} className="text-sm font-semibold">
        Change password
      </Text>
      <FormField
        control={form.control}
        name="currentPassword"
        label="Current password"
        password
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => newRef.current?.focus()}
      />
      <FormField
        control={form.control}
        name="newPassword"
        label="New password"
        password
        inputRef={newRef}
        placeholder="At least 8 characters"
        description="Use at least 8 characters."
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => confirmRef.current?.focus()}>
        {/* The strength meter from the register screen (the web's change form has none). */}
        <View className="mt-1.5 flex-row items-center gap-2">
          <View aria-hidden className="h-1.5 flex-1 flex-row gap-1">
            {[0, 1, 2, 3].map((i) => (
              <View key={i} className={cn('h-full flex-1 rounded-full', i < strength ? STRENGTH[strength].cls : 'bg-border')} />
            ))}
          </View>
          <Text
            accessibilityLabel={newPassword ? `Password strength: ${STRENGTH[strength].label}` : undefined}
            className="w-14 text-right text-xs text-muted-foreground">
            {newPassword ? STRENGTH[strength].label : ''}
          </Text>
        </View>
      </FormField>
      <FormField
        control={form.control}
        name="confirmPassword"
        label="Repeat new password"
        password
        inputRef={confirmRef}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => onSubmit()}
      />
      <SubmitButton
        pending={isSubmitting}
        pendingText="Changing…"
        accessibilityLabel={isSubmitting ? 'Changing…' : 'Change password'}
        onPress={() => onSubmit()}>
        Change password
      </SubmitButton>
    </View>
  );
}

export function SignOutEverywhere() {
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function run() {
    setConfirming(false);
    setPending(true);
    try {
      await signOutEverywhere();
      // Signed out: the route guard has already left this screen.
    } catch (err) {
      handleApiError(err, { fallback: "Couldn't sign out everywhere. Please try again." });
      setPending(false);
    }
  }

  return (
    <SettingsRow title="Sign out everywhere" description="Signs out every device and browser, this one included.">
      <SubmitButton
        variant="outline"
        pending={pending}
        pendingText="Signing out…"
        accessibilityLabel={pending ? 'Signing out…' : 'Sign out everywhere'}
        onPress={() => setConfirming(true)}>
        Sign out everywhere
      </SubmitButton>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Sign out everywhere?"
        description="Every device and browser signed in to your account will be signed out, including this one. You'll need to sign in again."
        confirmLabel="Sign out everywhere"
        destructive
        onConfirm={run}
      />
    </SettingsRow>
  );
}
