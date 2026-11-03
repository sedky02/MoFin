import * as React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signOut } from '@/api/session';
import { SubmitButton } from '@/components/auth/submit-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useUser } from '@/hooks/useUser';

// Placeholder signed-in screen (Phase 4). Phase 5 replaces it with the dashboard shell.
export default function HomeScreen() {
  const { data: user, isPending, isError, refetch } = useUser();
  const [signingOut, setSigningOut] = React.useState(false);
  const name = user?.displayName?.trim() || user?.email;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{isPending ? 'Loading…' : name ? `Signed in as ${name}` : 'Signed in'}</CardTitle>
            <CardDescription>
              {user?.isDemo
                ? 'This is a temporary demo account. Its data is deleted when the demo ends.'
                : 'The dashboard arrives in the next update.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-3">
            {isError ? (
              <Text className="text-sm text-destructive" role="alert" onPress={() => refetch()}>
                Couldn&apos;t load your profile. Tap to retry.
              </Text>
            ) : null}
            <SubmitButton
              variant="outline"
              pending={signingOut}
              pendingText="Signing out…"
              onPress={async () => {
                setSigningOut(true);
                await signOut();
              }}>
              Sign out
            </SubmitButton>
          </CardContent>
        </Card>
      </View>
    </SafeAreaView>
  );
}
