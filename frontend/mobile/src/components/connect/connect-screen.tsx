import { Link } from 'expo-router';
import { KeyboardScrollView } from '@/components/common/keyboard-scroll-view';
import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { connectedStates } from '@/core/connected-apps';
import { config } from '@/config';
import { useConnectedApps } from '@/hooks/useConnectedApps';
import { useUser } from '@/hooks/useUser';
import { Bot, EyeOff, ExternalLink, ShieldCheck, Undo2 } from '@/lib/icons';
import { cn } from '@/lib/utils';

import {
  CHATGPT_SETTINGS_URL,
  claudeDeepLink,
  CLIENTS,
  connectedMessage,
  geminiCliConfig,
  mcpUrlFor,
  unavailableMessage,
  type ClientKey,
} from './connect-model';
import { CopyButton } from './copy-button';

const MCP_URL = mcpUrlFor(config.apiUrl);

const TRUST: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ShieldCheck,
    title: 'Suggestions only',
    body: 'It reads your data and suggests transactions. You approve each one.',
  },
  {
    icon: EyeOff,
    title: 'No keys to paste',
    body: 'You sign in with MoFin. The assistant never sees your password.',
  },
  { icon: Undo2, title: 'Easy to undo', body: 'Disconnect any time in Settings.' },
];

function UrlField({ label = 'Connector URL' }: { label?: string }) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Input
          value={MCP_URL || 'Not available'}
          editable={false}
          selectTextOnFocus
          accessibilityLabel={label}
          className="min-h-11 min-w-0 flex-1 bg-muted/50 font-mono text-xs"
        />
        {MCP_URL ? <CopyButton value={MCP_URL} accessibilityLabel="Copy connector URL" /> : null}
      </View>
    </View>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <View className="gap-6">{children}</View>;
}

function Step({ n, title, children, action }: { n: number; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View className="flex-row gap-4">
      <View aria-hidden className="size-7 items-center justify-center rounded-full bg-secondary">
        <Text className="text-xs font-semibold text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
          {n}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text role="heading" aria-level={3} className="text-sm font-medium leading-7">
          {title}
        </Text>
        {children ? <Text className="text-sm text-muted-foreground">{children}</Text> : null}
        {action ? <View className="mt-2">{action}</View> : null}
      </View>
    </View>
  );
}

export function ConnectScreen() {
  const insets = useSafeAreaInsets();
  const { data: user } = useUser();
  const apps = useConnectedApps();
  const [active, setActive] = React.useState<ClientKey>('claude');

  // The demo can't connect an app (the backend refuses it), so don't send the visitor off to an
  // assistant for nothing; the same goes for a server with no URL.
  const message = unavailableMessage(MCP_URL, user?.isDemo);
  const unavailable = !!message;
  const connected = connectedStates(apps.data);
  const activeClient = CLIENTS.find((c) => c.key === active)!;
  const activeState = connected[active];
  const appName = active === 'other' ? 'An app' : activeClient.label;
  const gemini = geminiCliConfig(MCP_URL);

  function openButton(label: string, href: string) {
    return (
      <Button
        size="lg"
        disabled={unavailable}
        className="min-h-12 gap-2 self-start"
        accessibilityLabel={label}
        accessibilityHint={unavailable ? undefined : 'Opens in your browser'}
        onPress={() => void Linking.openURL(href)}>
        <Text>{label}</Text>
        <Icon as={ExternalLink} size={16} aria-hidden className="text-primary-foreground" />
      </Button>
    );
  }

  return (
    <KeyboardScrollView
      className="flex-1 bg-background"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="mx-auto w-full max-w-3xl p-4"
      contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}>
      {message ? (
        <View role="status" className="mb-6 rounded-xl border border-border bg-accent px-4 py-3">
          <Text testID="connect-unavailable" className="text-sm text-accent-foreground">
            {message}
          </Text>
        </View>
      ) : null}

      <View role="tablist" accessibilityLabel="Assistant" className="mb-4 flex-row flex-wrap gap-2">
        {CLIENTS.map(({ key, label }) => {
          const selected = key === active;
          return (
            <Pressable
              key={key}
              role="tab"
              aria-selected={selected}
              accessibilityLabel={connected[key] ? `${label} (Connected)` : label}
              accessibilityState={{ selected }}
              onPress={() => setActive(key)}
              className={cn(
                'min-h-12 min-w-[46%] flex-1 flex-row items-center gap-2.5 rounded-xl border bg-card px-3',
                selected ? 'border-primary bg-primary/5' : 'border-border',
              )}>
              <View aria-hidden className="size-8 items-center justify-center rounded-lg bg-secondary">
                <Icon as={Bot} size={18} className="text-muted-foreground" />
              </View>
              <Text className="flex-1 text-sm font-medium">{label}</Text>
              {connected[key] ? <View aria-hidden className="size-2 rounded-full bg-success" /> : null}
            </Pressable>
          );
        })}
      </View>

      <View className="gap-6 rounded-xl border border-border bg-card p-5">
        <View>
          <Text role="heading" aria-level={2} className="text-lg font-semibold tracking-tight">
            {active === 'other' ? 'Connect another MCP client' : `Connect ${activeClient.label}`}
          </Text>
          <Text className="text-sm text-muted-foreground">{activeClient.hint}</Text>
        </View>

        {!unavailable && activeState ? (
          <View className="flex-row items-start gap-2">
            <View aria-hidden className="mt-1.5 size-2 rounded-full bg-success" />
            <Text testID="connected-status" className="min-w-0 flex-1 text-sm">
              {connectedMessage(activeState, appName)}{' '}
              <Link href="/settings" className="font-medium text-primary-text">
                Manage in Settings
              </Link>
            </Text>
          </View>
        ) : null}

        {active === 'claude' ? (
          <>
            <Steps>
              <Step n={1} title="Add MoFin to Claude" action={openButton('Add to Claude', claudeDeepLink(MCP_URL))}>
                Opens Claude with everything filled in.
              </Step>
              <Step n={2} title="Confirm in Claude">
                Check the details, then confirm.
              </Step>
              <Step n={3} title="Sign in and approve">
                Claude brings you back here to approve.
              </Step>
            </Steps>
            <View className="gap-2">
              <Text className="text-sm font-medium">Didn&apos;t work?</Text>
              <Text className="text-sm text-muted-foreground">In Claude: Settings → Connectors → Add custom connector.</Text>
              <UrlField />
            </View>
          </>
        ) : null}

        {active === 'chatgpt' ? (
          <Steps>
            <Step n={1} title="Open ChatGPT's connectors" action={openButton('Open ChatGPT connector settings', CHATGPT_SETTINGS_URL)}>
              Settings → Apps &amp; Connectors.
            </Step>
            <Step n={2} title="Create a custom connector" />
            <Step n={3} title="Paste this as the server URL" action={<UrlField label="Server URL" />} />
            <Step n={4} title="Connect and approve">
              ChatGPT brings you back here to approve.
            </Step>
          </Steps>
        ) : null}

        {active === 'gemini' ? (
          <>
            <Text className="text-sm text-muted-foreground">The Gemini app can&apos;t add connectors yet. Gemini CLI can:</Text>
            <Steps>
              <Step n={1} title="Open the settings file">
                ~/.gemini/settings.json
              </Step>
              <Step
                n={2}
                title="Add this configuration"
                action={
                  <View className="gap-2">
                    <ScrollView horizontal className="rounded-lg border border-border bg-muted/30 p-4">
                      <Text selectable className="font-mono text-xs">
                        {gemini}
                      </Text>
                    </ScrollView>
                    {MCP_URL ? <CopyButton value={gemini} accessibilityLabel="Copy the Gemini CLI configuration" /> : null}
                  </View>
                }
              />
            </Steps>
          </>
        ) : null}

        {active === 'other' ? (
          <Steps>
            <Step n={1} title="Add a custom remote MCP server" />
            <Step n={2} title="Paste this as the server URL" action={<UrlField />} />
            <Step n={3} title="Choose OAuth if asked">
              You&apos;ll come back here to approve.
            </Step>
          </Steps>
        ) : null}

        <View accessibilityLabel="How access works" className="gap-5 border-t border-border pt-6">
          {TRUST.map(({ icon, title, body }) => (
            <View key={title} className="gap-1">
              <View className="flex-row items-center gap-2">
                <Icon as={icon} size={16} aria-hidden className="text-primary-text" />
                <Text className="text-sm font-medium">{title}</Text>
              </View>
              <Text className="text-sm text-muted-foreground">{body}</Text>
            </View>
          ))}
        </View>
      </View>
    </KeyboardScrollView>
  );
}
