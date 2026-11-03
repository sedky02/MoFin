import { View } from 'react-native';

import { SubmitButton } from '@/components/auth/submit-button';
import { Text } from '@/components/ui/text';
import { useUser } from '@/hooks/useUser';
import { initials } from '@/lib/initials';

/** Who is signed in, with a Sign out button (the web keeps this at the end of its sidebar). */
export function UserCard({ onSignOut, signingOut }: { onSignOut: () => void; signingOut: boolean }) {
  const { data: user } = useUser();
  return (
    <View className="gap-4 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-3">
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="size-12 items-center justify-center rounded-full bg-primary/15">
          <Text className="text-base font-semibold text-primary-text">{initials(user?.displayName, user?.email)}</Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-base font-medium">
            {user?.displayName || 'Welcome'}
          </Text>
          {user?.email ? (
            <Text numberOfLines={1} className="text-sm text-muted-foreground">
              {user.email}
            </Text>
          ) : null}
        </View>
      </View>
      <SubmitButton variant="outline" pending={signingOut} pendingText="Signing out…" onPress={onSignOut}>
        Sign out
      </SubmitButton>
    </View>
  );
}
