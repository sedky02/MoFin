import { zodResolver } from '@hookform/resolvers/zod';
import { User as UserIcon } from 'lucide-react-native';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';

import { FormField } from '@/components/auth/form-field';
import { SubmitButton } from '@/components/auth/submit-button';
import { ErrorState } from '@/components/common/states';
import { SettingsSectionCard } from '@/components/settings/settings-card';
import {
  avatarLetter,
  emailShown,
  profileChanged,
  profileSchema,
  SETTINGS_COPY,
  type ProfileValues,
} from '@/components/settings/settings-logic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { handleApiError } from '@/core/form-errors';
import { useUpdateUser, useUser } from '@/hooks/useUser';

/** Profile: the sign-in email (read only) and the display name. */
export function ProfileSection() {
  const { data: user, isLoading, isError, refetch } = useUser();
  const update = useUpdateUser();
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: '' },
    mode: 'onTouched',
  });

  React.useEffect(() => {
    if (user) form.reset({ displayName: user.displayName ?? '' });
  }, [user, form]);

  const displayName = useWatch({ control: form.control, name: 'displayName' }) ?? '';
  const changed = profileChanged(user, displayName);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ displayName: values.displayName });
    } catch (err) {
      handleApiError(err, { setError: form.setError });
    }
  });

  return (
    <SettingsSectionCard icon={UserIcon} title="Profile" description={SETTINGS_COPY.profile}>
      {isLoading ? (
        <View aria-busy accessibilityLabel="Loading" className="gap-5">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-[4.5rem] w-full" />
        </View>
      ) : isError || !user ? (
        <ErrorState description="Couldn't load your profile." onRetry={() => refetch()} />
      ) : (
        <View className="gap-5">
          <View className="flex-row items-center gap-4 rounded-xl bg-muted/40 p-4">
            <View aria-hidden className="size-14 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Text className="text-xl font-semibold text-primary-text">{avatarLetter(displayName, user)}</Text>
            </View>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="font-medium">
                {displayName.trim() || SETTINGS_COPY.noDisplayName}
              </Text>
              <Text numberOfLines={1} className="text-sm text-muted-foreground">
                {emailShown(user)}
              </Text>
            </View>
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-medium">Email</Text>
            <Input
              value={emailShown(user)}
              editable={false}
              accessibilityLabel="Email"
              aria-disabled
              className="h-11 bg-muted/50 opacity-70 sm:h-11"
            />
          </View>

          <FormField
            control={form.control}
            name="displayName"
            label="Display name"
            placeholder="Your name"
            description="Shown across the app."
            autoComplete="name"
            textContentType="name"
            returnKeyType="done"
            onSubmitEditing={() => changed && onSubmit()}
          />

          {changed ? (
            <View className="gap-3">
              <SubmitButton pending={update.isPending} pendingText="Saving…" onPress={() => onSubmit()}>
                Save changes
              </SubmitButton>
              <Button
                variant="ghost"
                className="h-11 sm:h-11"
                disabled={update.isPending}
                onPress={() => form.reset({ displayName: user.displayName ?? '' })}>
                <Text>Discard</Text>
              </Button>
            </View>
          ) : null}
        </View>
      )}
    </SettingsSectionCard>
  );
}
