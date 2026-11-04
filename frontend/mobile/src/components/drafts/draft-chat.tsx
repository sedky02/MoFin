import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import type { AiChatMessage } from '@/core/types';
import { chatErrorMessage, useAiChat } from '@/hooks/useAiChat';
import { CornerDownRight, Sparkles } from '@/lib/icons';
import { cn } from '@/lib/utils';

// Whole sentences, so it is plain what a tap puts in the box.
const CHAT_EXAMPLES = [
  'How much did I spend on food this month?',
  'Compare my spending this month with last month',
  'Am I on track with my goals?',
];

// The server sends the tool names it read from; show them as plain labels.
const TOOL_LABELS: Record<string, string> = {
  search_transactions: 'transactions',
  get_balance: 'balances',
  get_monthly_summary: 'monthly summary',
  list_accounts: 'accounts',
  list_goals: 'goals',
  get_goal: 'goal',
  get_goal_history: 'goal history',
  list_categories: 'categories',
};

interface Turn extends AiChatMessage {
  usedTools?: string[];
}

/** "Ask": questions about your own data, answered from read-only tools. Nothing is changed. */
export function DraftChat() {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const chat = useAiChat();

  async function send() {
    const content = input.trim();
    if (!content || chat.isPending) return;
    const next: Turn[] = [...turns, { role: 'user', content }];
    setTurns(next);
    setInput('');
    setError(null);
    try {
      const reply = await chat.mutateAsync(next.map(({ role, content: c }) => ({ role, content: c })));
      setTurns([...next, { role: 'assistant', content: reply.message, usedTools: reply.usedTools }]);
    } catch (err) {
      setError(chatErrorMessage(err));
      // Give the question back so a retry is one tap.
      setTurns(turns);
      setInput(content);
    }
  }

  return (
    <View>
      {turns.length > 0 && (
        <View accessibilityLabel="Conversation" className="mb-4 gap-3">
          {turns.map((turn, i) => (
            <View key={i} className={cn('flex-row', turn.role === 'user' && 'justify-end')}>
              <View
                accessibilityLabel={`${turn.role === 'user' ? 'You' : 'MoFin'}: ${turn.content}`}
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-2.5',
                  turn.role === 'user' ? 'bg-primary' : 'border border-border bg-card',
                )}>
                <Text className={cn('text-base', turn.role === 'user' && 'text-primary-foreground')}>{turn.content}</Text>
                {turn.usedTools && turn.usedTools.length > 0 && (
                  <Text className="mt-2 text-xs text-muted-foreground">
                    Looked at: {turn.usedTools.map((t) => TOOL_LABELS[t] ?? t).join(', ')}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {chat.isPending && (
        <Text accessibilityLiveRegion="polite" className="mb-3 text-sm text-muted-foreground">
          Looking at your data…
        </Text>
      )}
      {error && (
        <Text accessibilityRole="alert" className="mb-3 text-sm text-destructive">
          {error}
        </Text>
      )}

      <View className="gap-3 rounded-2xl border border-border bg-card p-3">
        <Textarea
          value={input}
          onChangeText={setInput}
          placeholder="Ask about your spending, e.g. How much did I spend on food last month?"
          numberOfLines={3}
          maxLength={2000}
          className="min-h-20 border-0 bg-transparent px-1 shadow-none dark:bg-transparent"
          accessibilityLabel="Ask a question about your finances"
        />
        <Text className="px-1 text-xs text-muted-foreground">Reads your data. Never changes it.</Text>
        <Button
          onPress={send}
          disabled={!input.trim() || chat.isPending}
          aria-busy={chat.isPending}
          className="min-h-11 gap-2"
          accessibilityLabel="Ask">
          <Icon as={Sparkles} size={16} className="text-primary-foreground" />
          <Text>{chat.isPending ? 'Thinking…' : 'Ask'}</Text>
        </Button>
      </View>

      {turns.length === 0 && (
        <>
          <Text className="mb-2 mt-4 px-1 text-sm font-semibold text-muted-foreground">Try one</Text>
          <View accessibilityLabel="Examples" className="flex-row flex-wrap gap-2">
            {CHAT_EXAMPLES.map((text) => (
              <Pressable
                key={text}
                role="button"
                accessibilityLabel={`Use example: ${text}`}
                onPress={() => setInput(text)}
                className="min-h-10 max-w-full flex-row items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 active:bg-accent">
                <Icon as={CornerDownRight} size={14} aria-hidden className="text-muted-foreground" />
                <Text numberOfLines={1} className="shrink text-sm">
                  {text}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
