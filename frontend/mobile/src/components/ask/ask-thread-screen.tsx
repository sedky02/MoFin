import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SUGGESTIONS } from '@/components/ask/ask-chat-list';
import { AssistantMessage, FailedMessage, ThinkingMessage, UserMessage } from '@/components/ask/ask-message';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { PLACEHOLDER_CLASS } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { ApiClientError } from '@/api/client';
import { chatErrorMessage, useAiChatDetail, useSendChatMessage } from '@/hooks/useAiChat';
import { haptics } from '@/lib/haptics';
import { openSpeechSettings, useSpeechRecognition } from '@/hooks/use-speech-recognition';
import { ArrowUp, Mic, Square } from '@/lib/icons';
import { cn } from '@/lib/utils';

const MAX_QUESTION_CHARS = 2000;

function Composer({
  value,
  onChange,
  onSend,
  pending,
  listening,
  onMic,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  pending: boolean;
  listening: boolean;
  onMic: () => void;
}) {
  const canSend = value.trim().length > 0 && !pending;
  const left = MAX_QUESTION_CHARS - value.length;
  return (
    <View className="flex-row items-end gap-2 rounded-3xl border border-border bg-card py-1.5 pl-4 pr-1.5">
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Ask about your money…"
        multiline
        maxLength={MAX_QUESTION_CHARS}
        accessibilityLabel="Ask a question about your finances"
        accessibilityHint={left <= 200 ? `${left} characters left` : undefined}
        className="max-h-32 min-h-10 flex-1 py-2 text-base text-foreground"
        placeholderClassName={PLACEHOLDER_CLASS}
        textAlignVertical="center"
        editable={!listening}
      />
      <Pressable
        role="button"
        accessibilityLabel={listening ? 'Stop listening' : 'Speak your question'}
        onPress={() => {
          haptics.tap();
          onMic();
        }}
        className={cn('size-11 items-center justify-center rounded-full', listening ? 'bg-destructive/15' : 'active:bg-accent')}>
        <Icon as={listening ? Square : Mic} size={listening ? 16 : 18} className={listening ? 'text-destructive' : 'text-muted-foreground'} />
      </Pressable>
      <Pressable
        role="button"
        accessibilityLabel={pending ? 'Answering' : 'Send question'}
        accessibilityState={{ disabled: !canSend, busy: pending }}
        disabled={!canSend}
        onPress={() => {
          haptics.tap();
          onSend();
        }}
        className={cn('size-11 items-center justify-center rounded-full bg-primary', !canSend && 'opacity-40')}>
        <Icon as={ArrowUp} size={18} className="text-primary-foreground" />
      </Pressable>
    </View>
  );
}

/**
 * `id` is "new" for an unsaved chat; the first answer gives it an id that replaces "new" in the
 * route. `q` asks a question straight away (a tapped suggestion).
 */
export function AskThreadScreen() {
  const params = useLocalSearchParams<{ id: string; q?: string }>();
  const chatId = params.id && params.id !== 'new' ? params.id : null;
  const detail = useAiChatDetail(chatId);
  const send = useSendChatMessage();
  const insets = useSafeAreaInsets();
  // KeyboardAvoidingView measures from its parent, so it needs this screen's top in the window.
  const frameRef = React.useRef<React.ComponentRef<typeof View>>(null);
  const [frameTop, setFrameTop] = React.useState(0);
  const scrollRef = React.useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [input, setInput] = React.useState('');
  const [pending, setPending] = React.useState<{ content: string; error?: string } | null>(null);

  const messages = detail.data?.messages ?? [];

  // Spoken words go into the box to check or edit; the question then goes out marked as voice.
  const [spoken, setSpoken] = React.useState(false);
  const speech = useSpeechRecognition({
    onDone: (text) => {
      setInput((prev) => [prev.trim(), text].filter(Boolean).join(' '));
      setSpoken(true);
    },
  });
  const shown = speech.listening ? [input.trim(), speech.finalText, speech.interimText].filter(Boolean).join(' ') : input;

  async function ask(text: string) {
    const content = text.trim();
    if (!content || send.isPending) return;
    const inputMode = spoken ? 'voice' : 'text';
    setPending({ content });
    setInput('');
    setSpoken(false);
    try {
      const turn = await send.mutateAsync({ chatId, content, inputMode });
      setPending(null);
      haptics.success();
      if (!chatId) router.setParams({ id: turn.chat.id, q: undefined });
    } catch (err) {
      haptics.warning();
      setPending({ content, error: chatErrorMessage(err) });
      if (err instanceof ApiClientError && err.status === 404 && chatId) router.setParams({ id: 'new' });
    }
  }

  // A tapped suggestion: ask it once, as soon as the screen opens.
  const asked = React.useRef(false);
  const askSuggestion = React.useEffectEvent((question: string) => void ask(question));
  React.useEffect(() => {
    if (params.q && !chatId && !asked.current) {
      asked.current = true;
      askSuggestion(params.q);
    }
  }, [params.q, chatId]);

  const title = chatId ? (detail.data?.title ?? 'Chat') : 'New chat';
  const empty = !chatId && !pending;

  return (
    <View
      ref={frameRef}
      onLayout={() => frameRef.current?.measureInWindow((_x, y) => setFrameTop((prev) => (Math.abs(prev - y) > 1 ? y : prev)))}
      className="flex-1 bg-background">
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={frameTop}>
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerClassName="mx-auto w-full max-w-2xl gap-6 px-4 py-5"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {empty ? (
            <View className="gap-4 pt-4">
              <Text role="heading" aria-level={1} className="text-2xl font-semibold">
                Ask about your money
              </Text>
              <Text className="text-base text-muted-foreground">
                Answers come from your own accounts, transactions and goals, with charts when a picture says it better.
              </Text>
              <View className="gap-2">
                {SUGGESTIONS.map(({ icon, text }) => (
                  <Pressable
                    key={text}
                    role="button"
                    accessibilityLabel={`Ask: ${text}`}
                    onPress={() => void ask(text)}
                    className="min-h-14 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 active:bg-accent">
                    <View aria-hidden className="size-9 items-center justify-center rounded-full bg-chart-2/15">
                      <Icon as={icon} size={17} className="text-chart-2" />
                    </View>
                    <Text className="flex-1 text-base">{text}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : chatId && detail.isLoading ? (
            <View className="gap-6">
              <Skeleton className="h-11 w-2/3 self-end rounded-3xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </View>
          ) : chatId && detail.isError && !pending ? (
            <View className="items-center gap-3 py-16">
              <Text className="text-center text-muted-foreground">
                {detail.error instanceof ApiClientError && detail.error.status === 404 ? 'This chat no longer exists.' : "Couldn't load this chat."}
              </Text>
              <Button variant="outline" onPress={() => detail.refetch()} className="min-h-11">
                <Text>Try again</Text>
              </Button>
            </View>
          ) : (
            <>
              {messages.map((m) =>
                m.role === 'user' ? <UserMessage key={m.id} content={m.content} createdAt={m.createdAt} /> : <AssistantMessage key={m.id} message={m} />,
              )}
              {pending ? <UserMessage content={pending.content} /> : null}
              {pending && !pending.error ? <ThinkingMessage /> : null}
              {pending?.error ? <FailedMessage error={pending.error} onRetry={() => void ask(pending.content)} /> : null}
            </>
          )}
        </ScrollView>
        <View className="mx-auto w-full max-w-2xl border-t border-border/60 bg-background px-3 pt-2" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
          {speech.error ? (
            <View accessibilityRole="alert" className="mb-2 flex-row items-center gap-2 px-1">
              <Text className="flex-1 text-xs text-muted-foreground">{speech.error.message}</Text>
              {speech.error.kind === 'permission' ? (
                <Pressable role="link" accessibilityLabel="Open Settings" onPress={openSpeechSettings} className="min-h-11 justify-center px-2">
                  <Text className="text-xs font-medium text-primary-text">Open Settings</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <Composer
            value={shown}
            onChange={(v) => {
              setInput(v);
              if (!v.trim()) setSpoken(false);
            }}
            onSend={() => void ask(input)}
            pending={send.isPending}
            listening={speech.listening}
            onMic={() => (speech.listening ? speech.stop() : void speech.start())}
          />
          <Text className="mt-1.5 text-center text-[11px] text-muted-foreground">Drafts wait for your approval.</Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
