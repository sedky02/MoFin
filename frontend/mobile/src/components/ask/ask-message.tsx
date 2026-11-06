import * as Clipboard from 'expo-clipboard';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { AskChart } from '@/components/ask/ask-chart';
import { ChatDraftCards } from '@/components/ask/chat-draft-cards';
import { LogoMark } from '@/components/common/logo-mark';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { AiChatMessage } from '@/core/types';
import { haptics } from '@/lib/haptics';
import { Check, CircleAlert, Copy, RotateCcw } from '@/lib/icons';
import { toast } from '@/lib/toast';

// The server sends the tool names it read from; show them as plain labels. Same as the web.
export const TOOL_LABELS: Record<string, string> = {
  search_transactions: 'transactions',
  get_balance: 'balances',
  get_monthly_summary: 'monthly summary',
  list_accounts: 'accounts',
  list_goals: 'goals',
  get_goal: 'goal',
  get_goal_history: 'goal history',
  list_categories: 'categories',
  chart_spending_by_category: 'spending by category',
  chart_income_vs_expenses: 'monthly totals',
  chart_daily_trend: 'daily activity',
};

/** `**bold**` inside a line; everything else stays text. */
function inline(text: string, key: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <Text key={`${key}-${i}`} className="font-semibold">
        {part.slice(2, -2)}
      </Text>
    ) : (
      part
    ),
  );
}

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*(\d+)[.)]\s+/;

/** Paragraphs, "- " bullets, "1." lists and **bold**: the little formatting the assistant uses. */
export function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <View className="gap-2.5">
      {blocks.map((block, b) => {
        const lines = block.split('\n').filter((l) => l.trim());
        const list = lines.length > 0 && lines.every((l) => BULLET.test(l) || NUMBERED.test(l));
        if (list) {
          return (
            <View key={b} className="gap-1">
              {lines.map((l, i) => {
                const n = NUMBERED.exec(l)?.[1];
                return (
                  <View key={i} className="flex-row gap-2 pr-2">
                    <Text className="text-base leading-6 text-muted-foreground">{n ? `${n}.` : '•'}</Text>
                    <Text className="flex-1 text-base leading-6">{inline(l.replace(n ? NUMBERED : BULLET, ''), `${b}-${i}`)}</Text>
                  </View>
                );
              })}
            </View>
          );
        }
        return (
          <Text key={b} className="text-base leading-6">
            {lines.map((l, i) => (
              <React.Fragment key={i}>
                {i > 0 ? '\n' : ''}
                {inline(l, `${b}-${i}`)}
              </React.Fragment>
            ))}
          </Text>
        );
      })}
    </View>
  );
}

/** MoFin's own mark next to its answers; a red alert circle when an answer failed. */
function Avatar({ tone = 'assistant' }: { tone?: 'assistant' | 'error' }) {
  if (tone === 'assistant') {
    return (
      <View aria-hidden className="mt-0.5">
        <LogoMark size={32} />
      </View>
    );
  }
  return (
    <View aria-hidden className="size-8 items-center justify-center rounded-full bg-destructive/15">
      <Icon as={CircleAlert} size={16} className="text-destructive" />
    </View>
  );
}

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function UserMessage({ content, createdAt }: { content: string; createdAt?: string }) {
  return (
    <View className="items-end">
      <View accessible accessibilityLabel={`You: ${content}`} className="max-w-[85%] rounded-3xl rounded-br-lg bg-primary px-4 py-2.5">
        <Text selectable className="text-base text-primary-foreground">
          {content}
        </Text>
      </View>
      {createdAt ? <Text className="mt-1 pr-1 text-[11px] text-muted-foreground">{time(createdAt)}</Text> : null}
    </View>
  );
}

function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Pressable
      role="button"
      accessibilityLabel={copied ? 'Copied' : 'Copy answer'}
      hitSlop={10}
      onPress={async () => {
        try {
          await Clipboard.setStringAsync(text);
          haptics.tap();
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Couldn't copy the answer.");
        }
      }}
      className="size-9 items-center justify-center rounded-full active:bg-accent">
      <Icon as={copied ? Check : Copy} size={15} className="text-muted-foreground" />
    </Pressable>
  );
}

export function AssistantMessage({ message }: { message: AiChatMessage }) {
  // Charts and drafts show themselves below; this line is for what was read.
  const tools = message.usedTools.filter((t) => !t.startsWith('chart_') && t !== 'create_draft_transaction');
  return (
    <View className="flex-row gap-3">
      <Avatar />
      <View className="min-w-0 flex-1 gap-3">
        <View accessible accessibilityLabel={`MoFin: ${message.content}`}>
          <RichText text={message.content} />
        </View>
        {message.charts.map((chart, i) => (
          <AskChart key={`${chart.title}-${i}`} chart={chart} />
        ))}
        <ChatDraftCards drafts={message.drafts ?? []} />
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <Text className="text-[11px] text-muted-foreground">{time(message.createdAt)}</Text>
          {tools.length > 0 ? (
            <Text className="text-[11px] text-muted-foreground" accessibilityLabel={`Looked at ${tools.map((t) => TOOL_LABELS[t] ?? t).join(', ')}`}>
              · Looked at {tools.map((t) => TOOL_LABELS[t] ?? t).join(', ')}
            </Text>
          ) : null}
          <CopyAnswer text={message.content} />
        </View>
      </View>
    </View>
  );
}

/** Shown while the answer is on its way. */
export function ThinkingMessage() {
  return (
    <View className="flex-row gap-3" accessibilityLiveRegion="polite" accessibilityLabel="MoFin is looking at your data">
      <Avatar />
      <View className="rounded-3xl rounded-tl-lg border border-border bg-card px-4 py-3">
        <Text className="text-sm text-muted-foreground">Looking at your data…</Text>
      </View>
    </View>
  );
}

/** The answer failed: say why, and offer the same question again. */
export function FailedMessage({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <View className="flex-row gap-3">
      <Avatar tone="error" />
      <View accessibilityRole="alert" className="min-w-0 flex-1 gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3">
        <Text className="text-sm">{error}</Text>
        <Button variant="outline" size="sm" onPress={onRetry} className="min-h-11 self-start gap-1.5" accessibilityLabel="Try again">
          <Icon as={RotateCcw} size={14} />
          <Text>Try again</Text>
        </Button>
      </View>
    </View>
  );
}
