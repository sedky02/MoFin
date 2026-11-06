// Answers an invitation the app was opened with. The web's /invitations/accept page, for someone
// already signed in here: the route guard handles the rest.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, ApiClientError } from '@/api/client';
import { SkeletonCard } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ROLE_HELP, ROLE_LABEL } from '@/core/account-sharing';
import type { InvitationPreview } from '@/core/types';
import { useUser } from '@/hooks/useUser';
import { forgetInvite, pendingInvite } from '@/lib/pending-invite';
import { toast } from '@/lib/toast';

export function InvitationScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const token = pendingInvite();
  const { data: user } = useUser();
  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api.post<InvitationPreview>('/invitations/preview', { token }),
    enabled: !!token,
    retry: false,
  });
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [needsVerifying, setNeedsVerifying] = React.useState(false);
  const [verificationSent, setVerificationSent] = React.useState(false);

  function done() {
    forgetInvite();
    router.replace('/dashboard');
  }

  async function accept() {
    setBusy(true);
    setProblem(null);
    try {
      await api.post('/invitations/accept', { token });
      await queryClient.invalidateQueries();
      toast.success(`You joined ${preview.data?.accountName}.`);
      forgetInvite();
      router.replace('/accounts');
    } catch (err) {
      const code = err instanceof ApiClientError ? (err.body as { code?: string } | undefined)?.code : undefined;
      if (code === 'EMAIL_NOT_VERIFIED') setNeedsVerifying(true);
      else setProblem(err instanceof Error ? err.message : 'Could not accept the invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    await api.post('/invitations/decline', { token }).catch(() => undefined);
    setBusy(false);
    done();
  }

  async function sendVerification() {
    setBusy(true);
    setProblem(null);
    try {
      await api.post('/auth/email/verification');
      setVerificationSent(true);
    } catch {
      setProblem('Could not send the email. Try again in a few minutes.');
    } finally {
      setBusy(false);
    }
  }

  const frame = (children: React.ReactNode) => (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="mx-auto w-full max-w-3xl gap-4 p-4"
      contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}>
      {children}
    </ScrollView>
  );

  if (preview.isLoading) return frame(<SkeletonCard />);

  if (!token || preview.isError || !preview.data) {
    return frame(
      <>
        <Text role="heading" aria-level={1} className="text-xl font-semibold">
          This invitation can&apos;t be used
        </Text>
        <Text className="text-sm text-muted-foreground">
          It may have expired, been revoked or already been answered. Ask for a new one.
        </Text>
        <Button variant="outline" className="min-h-11" onPress={done}>
          <Text>Go to MoFin</Text>
        </Button>
      </>,
    );
  }

  const invitation = preview.data;
  const role = ROLE_LABEL[invitation.role].toLowerCase();
  const wrongPerson = !!user && user.email !== invitation.email;

  return frame(
    <>
      <Text role="heading" aria-level={1} className="text-xl font-semibold">
        {invitation.invitedBy} invited you to an account
      </Text>
      <Text className="text-sm text-muted-foreground">
        Join <Text className="text-sm font-medium">{invitation.accountName}</Text> ({invitation.currency}) as{' '}
        {role === 'editor' ? 'an' : 'a'} {role}. {ROLE_HELP[invitation.role]}
      </Text>
      <Text className="text-sm text-muted-foreground">
        You&apos;ll see its full history, and the owner and other members will see what you add.
      </Text>
      {problem ? (
        <Text role="alert" className="text-sm text-destructive">
          {problem}
        </Text>
      ) : null}
      {wrongPerson ? (
        <Text role="alert" className="text-sm text-destructive">
          This invitation is for {invitation.email}, and you&apos;re signed in as {user.email}. Sign out and sign in with that
          address to accept it.
        </Text>
      ) : needsVerifying ? (
        <View className="gap-3">
          <Text className="text-sm">
            Verify {invitation.email} first. We&apos;ll email you a link; open it, then come back here.
          </Text>
          {verificationSent ? (
            <Button className="min-h-11" disabled={busy} onPress={accept}>
              <Text>I&apos;ve verified it</Text>
            </Button>
          ) : (
            <Button className="min-h-11" disabled={busy} onPress={sendVerification}>
              <Text>Send verification email</Text>
            </Button>
          )}
        </View>
      ) : (
        <View className="gap-2">
          <Button className="min-h-11" disabled={busy} onPress={accept}>
            <Text>Accept invitation</Text>
          </Button>
          <Button variant="outline" className="min-h-11" disabled={busy} onPress={decline}>
            <Text>Decline</Text>
          </Button>
        </View>
      )}
    </>,
  );
}
