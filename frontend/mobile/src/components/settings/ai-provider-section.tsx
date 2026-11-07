import * as React from 'react';
import { View } from 'react-native';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { HelpHint } from '@/components/common/help-hint';
import { SettingsSectionCard } from '@/components/settings/settings-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import type { User } from '@/core/types';
import {
  useAiCredentials,
  useRemoveAiKey,
  useSaveAiKey,
  useUpdateAiPreferences,
  type AiProviderId,
  type AiProviderStatus,
} from '@/hooks/useAiCredentials';
import { useUser } from '@/hooks/useUser';
import { Sparkles } from '@/lib/icons';

export const AI_PROVIDER_COPY = {
  description: 'Choose which assistant answers your questions and drafts transactions from what you write.',
  keyHelp:
    'Your key is encrypted on our server and used only to send your own requests to the provider you chose. It is never shown again, only its last four characters. Remove it here at any time.',
  fallbackHelp:
    "If your provider refuses your key or is down, MoFin can answer that one request with its own shared assistant (hosted on Groq). Your question and the figures it needs then go to that service instead of the provider you chose. Turn this off to see an error instead.",
  demo: 'Not available in the demo. Create your own account to use your own AI key.',
  unavailable: "Storing your own key isn't set up on this server.",
} as const;

function KeyForm({ provider, onDone }: { provider: AiProviderStatus; onDone: () => void }) {
  const save = useSaveAiKey();
  const [apiKey, setApiKey] = React.useState('');
  const [model, setModel] = React.useState('');

  function submit() {
    save.mutate(
      { provider: provider.provider, apiKey: apiKey.trim(), model: model.trim() || undefined },
      {
        onSuccess: () => {
          // The key leaves memory as soon as it is saved.
          setApiKey('');
          onDone();
        },
      },
    );
  }

  return (
    <View className="gap-3 border-t border-border bg-muted/30 p-3">
      <View className="gap-1.5">
        <Text className="text-sm font-medium">{provider.label} API key</Text>
        <Input
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          accessibilityLabel={`${provider.label} API key`}
          className="min-h-11 font-mono"
        />
      </View>
      <View className="gap-1.5">
        <Text className="text-sm font-medium">
          Model <Text className="font-normal text-muted-foreground">(optional)</Text>
        </Text>
        <Input
          value={model}
          onChangeText={setModel}
          placeholder={provider.model ?? provider.defaultModel}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={`${provider.label} model`}
          className="min-h-11 font-mono"
        />
      </View>
      <View className="flex-row justify-end gap-2">
        <Button variant="ghost" className="min-h-11" onPress={onDone} accessibilityLabel="Cancel">
          <Text>Cancel</Text>
        </Button>
        <Button
          className="min-h-11"
          disabled={save.isPending || apiKey.trim().length < 8}
          onPress={submit}
          accessibilityLabel="Save key">
          <Text>{save.isPending ? 'Checking key…' : 'Save key'}</Text>
        </Button>
      </View>
    </View>
  );
}

export function AiProviderSection() {
  const { data: user } = useUser();
  const demo = !!(user as User | undefined)?.isDemo;
  const credentials = useAiCredentials(!demo);
  const update = useUpdateAiPreferences();
  const remove = useRemoveAiKey();
  const [editing, setEditing] = React.useState<AiProviderId | null>(null);
  const [toRemove, setToRemove] = React.useState<AiProviderStatus | undefined>();

  const data = credentials.data;
  const sharedActive = data?.activeProvider == null;

  return (
    <SettingsSectionCard
      icon={Sparkles}
      title="AI provider"
      description={demo ? AI_PROVIDER_COPY.demo : AI_PROVIDER_COPY.description}
      action={demo ? undefined : <HelpHint label="How your key is kept">{AI_PROVIDER_COPY.keyHelp}</HelpHint>}>
      {demo ? null : credentials.isLoading ? (
        <Skeleton aria-busy accessibilityLabel="Loading" className="h-40 w-full" />
      ) : credentials.isError || !data ? (
        <Text role="alert" className="text-sm text-destructive">
          Couldn&apos;t load your AI provider settings.
        </Text>
      ) : (
        <View className="gap-4">
          {!data.available ? <Text className="text-sm text-muted-foreground">{AI_PROVIDER_COPY.unavailable}</Text> : null}
          <View className="overflow-hidden rounded-xl border border-border">
            <View className="min-h-14 flex-row items-center gap-3 p-3">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-medium">MoFin assistant</Text>
                <Text className="text-xs text-muted-foreground">Shared, no key needed</Text>
              </View>
              {sharedActive ? (
                <Text className="text-xs font-medium text-success">In use</Text>
              ) : (
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={update.isPending}
                  accessibilityLabel="Use MoFin assistant"
                  onPress={() => update.mutate({ activeProvider: null })}>
                  <Text>Use</Text>
                </Button>
              )}
            </View>
            {data.providers.map((p) => {
              const active = data.activeProvider === p.provider;
              return (
                <View key={p.provider}>
                  <Separator />
                  <View className="gap-2 p-3">
                    <View className="flex-row items-center gap-3">
                      <View className="min-w-0 flex-1">
                        <Text className="text-sm font-medium">{p.label}</Text>
                        <Text className="text-xs text-muted-foreground">
                          {p.connected ? `Key •••• ${p.last4} · ${p.model ?? p.defaultModel}` : 'No key added'}
                        </Text>
                      </View>
                      {active ? <Text className="text-xs font-medium text-success">In use</Text> : null}
                    </View>
                    <View className="flex-row flex-wrap gap-2">
                      {p.connected && !active ? (
                        <Button
                          variant="outline"
                          className="min-h-11"
                          disabled={update.isPending}
                          accessibilityLabel={`Use ${p.label}`}
                          onPress={() => update.mutate({ activeProvider: p.provider })}>
                          <Text>Use</Text>
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        className="min-h-11"
                        disabled={!data.available}
                        accessibilityLabel={`${p.connected ? 'Replace' : 'Add'} ${p.label} key`}
                        accessibilityState={{ expanded: editing === p.provider }}
                        onPress={() => setEditing(editing === p.provider ? null : p.provider)}>
                        <Text>{p.connected ? 'Replace' : 'Add key'}</Text>
                      </Button>
                      {p.connected ? (
                        <Button
                          variant="ghost"
                          className="min-h-11"
                          accessibilityLabel={`Remove ${p.label} key`}
                          onPress={() => setToRemove(p)}>
                          <Text className="text-muted-foreground">Remove</Text>
                        </Button>
                      ) : null}
                    </View>
                  </View>
                  {editing === p.provider ? <KeyForm provider={p} onDone={() => setEditing(null)} /> : null}
                </View>
              );
            })}
          </View>

          {!sharedActive ? (
            <View className="min-h-11 flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1 flex-row items-center">
                <Text nativeID="ai-fallback-label" className="shrink text-sm font-medium">
                  If my key fails, use MoFin&apos;s shared assistant
                </Text>
                <HelpHint label="What the fallback sends">{AI_PROVIDER_COPY.fallbackHelp}</HelpHint>
              </View>
              <Switch
                checked={data.fallbackEnabled}
                disabled={update.isPending}
                onCheckedChange={(checked) => update.mutate({ fallbackEnabled: checked })}
                aria-labelledby="ai-fallback-label"
                accessibilityLabel="Use the shared assistant if my key fails"
              />
            </View>
          ) : null}
        </View>
      )}

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(open) => !open && setToRemove(undefined)}
        title={`Remove your ${toRemove?.label ?? ''} key?`}
        description={
          toRemove && data?.activeProvider === toRemove.provider
            ? "Questions will go back to MoFin's shared assistant. You can add a key again later."
            : 'You can add a key again later.'
        }
        confirmLabel="Remove"
        onConfirm={() => {
          if (toRemove) remove.mutate(toRemove.provider);
          setToRemove(undefined);
        }}
      />
    </SettingsSectionCard>
  );
}
