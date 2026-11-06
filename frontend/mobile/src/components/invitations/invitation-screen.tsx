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
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { ROLE_LABEL } from '@/core/account-sharing';
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
      contentContainerClassName="mx-auto w-full max-w-md flex-grow justify-center p-4"
      contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}>
      <Card className="gap-0 rounded-[28px] border-0 p-3.5">{children}</Card>
    </ScrollView>
  );

  const heading = (text: string) => (
    <Text role="heading" aria-level={1} className="px-3 pb-5 pt-4 text-center text-xl font-semibold">
      {text}
    </Text>
  );

  if (preview.isLoading) return frame(<SkeletonCard />);

  if (!token || preview.isError || !preview.data) {
    return frame(
      <>
        {heading('Invitation unavailable')}
        <Text className="-mt-3 pb-5 text-center text-sm text-muted-foreground">Ask for a new one.</Text>
        <Button variant="outline" className="min-h-12 rounded-xl" onPress={done}>
          <Text>Go to MoFin</Text>
        </Button>
      </>,
    );
  }

  const invitation = preview.data;
  const wrongPerson = !!user && user.email !== invitation.email;

  return frame(
    <>
      {heading(`${invitation.invitedBy} invited you`)}
      {/* Same panel as the invitation email, so the two read as one step. */}
      <View className="rounded-xl bg-brand-ink p-5">
        <Text className="text-xs text-white/60">Shared account</Text>
        <Text numberOfLines={1} className="mt-1 text-2xl font-semibold text-white">
          {invitation.accountName}
        </Text>
        <View className="mt-3.5 flex-row items-center gap-2">
          <View className="rounded-full bg-brand-lime px-2.5 py-1">
            <Text className="text-xs font-semibold text-brand-ink">{ROLE_LABEL[invitation.role]}</Text>
          </View>
          <Text className="text-xs text-white/60">{invitation.currency}</Text>
        </View>
      </View>
      <View className="mt-3.5 gap-2">
        {wrongPerson ? null : needsVerifying ? (
          verificationSent ? (
            <Button className="min-h-12 rounded-xl" disabled={busy} onPress={accept}>
              <Text>I&apos;ve verified it</Text>
            </Button>
          ) : (
            <Button className="min-h-12 rounded-xl" disabled={busy} onPress={sendVerification}>
              <Text>Verify your email</Text>
            </Button>
          )
        ) : (
          <>
            <Button className="min-h-12 rounded-xl" disabled={busy} onPress={accept}>
              <Text>Accept</Text>
            </Button>
            <Button variant="ghost" className="min-h-12 rounded-xl" disabled={busy} onPress={decline}>
              <Text>Decline</Text>
            </Button>
          </>
        )}
      </View>
      {problem ? (
        <Text role="alert" className="px-2 pt-3.5 text-center text-sm text-destructive">
          {problem}
        </Text>
      ) : null}
      {wrongPerson ? (
        <Text role="alert" className="px-2 pt-3.5 text-center text-sm text-destructive">
          This invitation is for {invitation.email}.
        </Text>
      ) : null}
      {verificationSent ? (
        <Text className="px-2 pt-3.5 text-center text-sm text-muted-foreground">Check your inbox.</Text>
      ) : null}
    </>,
  );
}
