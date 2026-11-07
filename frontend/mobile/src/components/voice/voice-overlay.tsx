import { router } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { AssistantMessage, FailedMessage, ThinkingMessage, UserMessage } from '@/components/ask/ask-message';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { SheetScrollView } from '@/components/ui/sheet-parts';
import { Text } from '@/components/ui/text';
import { chatErrorMessage, useAiChatDetail, useSendChatMessage } from '@/hooks/useAiChat';
import { useHoldToTalk } from '@/hooks/use-hold-to-talk';
import { openSpeechSettings, useSpeechRecognition } from '@/hooks/use-speech-recognition';
import { haptics } from '@/lib/haptics';
import { ArrowUp, Keyboard, Mic, Square } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { useVoiceOverlayOpen, voiceOverlay } from '@/lib/voice-overlay';

function ListeningRings({ active }: { active: boolean }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  React.useEffect(() => {
    pulse.value = active && !reduceMotion ? withRepeat(withTiming(1, { duration: 1100 }), -1, false) : withTiming(0, { duration: 200 });
  }, [active, reduceMotion, pulse]);
  const ring = useAnimatedStyle(() => ({
    opacity: active ? 0.45 * (1 - pulse.value) : 0,
    transform: [{ scale: 1 + pulse.value * 0.7 }],
  }));
  const ring2 = useAnimatedStyle(() => ({
    opacity: active ? 0.3 * (1 - pulse.value) : 0,
    transform: [{ scale: 1 + pulse.value * 1.2 }],
  }));
  return (
    <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
      <Animated.View className="absolute size-16 rounded-full bg-primary" style={ring2} />
      <Animated.View className="absolute size-16 rounded-full bg-primary" style={ring} />
    </View>
  );
}

/**
 * Opened by holding Add: listens at once, shows what it hears, sends the question to Ask MoFin when
 * you pause and shows the answer with draft cards. It's all saved in an Ask chat.
 */
export function VoiceOverlay() {
  const open = useVoiceOverlayOpen();
  const { height } = useWindowDimensions();
  // Shared bottom sheet: the backdrop stays put while the sheet slides. Content mounts only while
  // open, so closing stops the mic.
  return (
    <Dialog open={open} onOpenChange={(next) => !next && voiceOverlay.close()}>
      <DialogContent className="gap-0 bg-card p-0" style={{ maxHeight: Math.round(height * 0.85) }}>
        <DialogTitle className="sr-only">Ask MoFin by voice</DialogTitle>
        {open ? <VoiceSheet /> : null}
      </DialogContent>
    </Dialog>
  );
}

function VoiceSheet() {
  const [chatId, setChatId] = React.useState<string | null>(null);
  const detail = useAiChatDetail(chatId);
  const send = useSendChatMessage();
  const [pending, setPending] = React.useState<{ content: string; error?: string } | null>(null);
  const [typing, setTyping] = React.useState(false);
  const [input, setInput] = React.useState('');
  const scrollRef = React.useRef<React.ComponentRef<typeof ScrollView>>(null);
  // The chat this overlay writes to, read when an answer lands.
  const chatRef = React.useRef<string | null>(null);

  async function ask(text: string, inputMode: 'voice' | 'text') {
    const content = text.trim();
    if (!content || send.isPending) return;
    setPending({ content });
    try {
      const turn = await send.mutateAsync({ chatId: chatRef.current, content, inputMode });
      chatRef.current = turn.chat.id;
      setChatId(turn.chat.id);
      setPending(null);
      haptics.success();
    } catch (err) {
      haptics.error();
      setPending({ content, error: chatErrorMessage(err) });
    }
  }

  const speech = useSpeechRecognition({ onDone: (text) => void ask(text, 'voice') });
  const mic = useHoldToTalk(speech, { onStart: () => setTyping(false) });

  // Listening starts as soon as the overlay opens.
  const { start } = speech;
  React.useEffect(() => {
    void start();
  }, [start]);

  function close() {
    // Unmounting stops the microphone; the chat is already saved.
    voiceOverlay.close();
  }

  function toggleMic() {
    haptics.tap();
    if (speech.listening) speech.stop();
    else {
      setTyping(false);
      void speech.start();
    }
  }

  function switchToKeyboard() {
    speech.abort();
    setTyping(true);
  }

  function openInChat() {
    const id = chatRef.current;
    close();
    if (id) router.push({ pathname: '/ask/[id]', params: { id } });
  }

  const messages = detail.data?.messages ?? [];
  const nothingYet = messages.length === 0 && !pending;
  const hearing = speech.finalText || speech.interimText;

  return (
    <>
          <View className="flex-row items-center justify-between pb-2 pl-5 pr-14">
            <Text role="heading" aria-level={2} className="text-base font-semibold">
              Ask MoFin
            </Text>
            <View className="flex-row items-center gap-1">
              {chatId ? (
                <Button variant="ghost" size="sm" className="min-h-11" accessibilityLabel="Open in chat" onPress={openInChat}>
                  <Text className="text-primary-text">Open in chat</Text>
                </Button>
              ) : null}
            </View>
          </View>

          <SheetScrollView
            ref={scrollRef}
            className="px-5"
            contentContainerClassName="gap-5 pb-4"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
            {messages.map((m) =>
              m.role === 'user' ? <UserMessage key={m.id} content={m.content} /> : <AssistantMessage key={m.id} message={m} />,
            )}
            {pending ? <UserMessage content={pending.content} /> : null}
            {pending && !pending.error ? <ThinkingMessage /> : null}
            {pending?.error ? <FailedMessage error={pending.error} onRetry={() => void ask(pending.content, 'voice')} /> : null}

            {/* What is being heard: settled words normally, words still being recognized lighter. */}
            {speech.listening || hearing ? (
              <Text accessibilityLiveRegion="polite" className="text-xl leading-8">
                {speech.finalText ? <Text className="text-xl leading-8 text-foreground">{speech.finalText} </Text> : null}
                {speech.interimText ? <Text className="text-xl leading-8 text-muted-foreground">{speech.interimText}</Text> : null}
                {!hearing ? <Text className="text-xl leading-8 text-muted-foreground">Listening…</Text> : null}
              </Text>
            ) : nothingYet && !speech.error && !typing ? (
              <Text className="text-xl leading-8 text-muted-foreground">Ask about your money, or say what you spent.</Text>
            ) : null}

            {speech.error ? (
              <View accessibilityRole="alert" className="gap-2 rounded-2xl bg-secondary px-4 py-3">
                <Text className="text-sm">{speech.error.message}</Text>
                {speech.error.kind === 'permission' ? (
                  <Button variant="outline" size="sm" className="min-h-11 self-start" accessibilityLabel="Open Settings" onPress={openSpeechSettings}>
                    <Text>Open Settings</Text>
                  </Button>
                ) : null}
              </View>
            ) : null}
          </SheetScrollView>

          {typing ? (
            <View className="mx-4 flex-row items-end gap-2 rounded-3xl border border-border bg-background py-1.5 pl-4 pr-1.5">
              <TextInput
                autoFocus
                value={input}
                onChangeText={setInput}
                placeholder="Type your question…"
                multiline
                maxLength={2000}
                accessibilityLabel="Type your question"
                className="max-h-28 min-h-10 flex-1 py-2 text-base text-foreground"
                placeholderClassName="text-muted-foreground"
              />
              <Pressable
                role="button"
                accessibilityLabel="Switch to voice"
                onPress={toggleMic}
                className="size-11 items-center justify-center rounded-full active:bg-accent">
                <Icon as={Mic} size={18} className="text-muted-foreground" />
              </Pressable>
              <Pressable
                role="button"
                accessibilityLabel="Send question"
                accessibilityState={{ disabled: !input.trim() || send.isPending }}
                disabled={!input.trim() || send.isPending}
                onPress={() => {
                  const text = input;
                  setInput('');
                  void ask(text, 'text');
                }}
                className={cn('size-11 items-center justify-center rounded-full bg-primary', (!input.trim() || send.isPending) && 'opacity-40')}>
                <Icon as={ArrowUp} size={18} className="text-primary-foreground" />
              </Pressable>
            </View>
          ) : (
            <View className="flex-row items-center justify-center gap-8 px-6 pt-2">
              <Pressable
                role="button"
                accessibilityLabel="Type instead"
                onPress={switchToKeyboard}
                className="size-12 items-center justify-center rounded-full bg-secondary active:bg-accent">
                <Icon as={Keyboard} size={20} className="text-foreground" />
              </Pressable>
              <View className="size-24 items-center justify-center">
                <ListeningRings active={speech.listening} />
                <Pressable
                  role="button"
                  accessibilityLabel={speech.listening ? 'Stop and send' : 'Speak'}
                  accessibilityHint={speech.listening ? 'Double tap to send' : 'Double tap to listen'}
                  accessibilityState={{ busy: send.isPending }}
                  disabled={send.isPending}
                  {...mic.pressProps}
                  className={cn('size-16 items-center justify-center rounded-full bg-primary shadow-md shadow-black/25', send.isPending && 'opacity-50')}>
                  <Icon as={speech.listening ? Square : Mic} size={speech.listening ? 20 : 26} className="text-primary-foreground" />
                </Pressable>
              </View>
              {/* Balances the keyboard button so the mic stays centred. */}
              <View className="size-12" />
            </View>
          )}
          {!typing && speech.listening ? (
            <Text className="px-6 pt-1 text-center text-xs text-muted-foreground">{mic.held ? 'Release to send' : 'Tap to send'}</Text>
          ) : null}
    </>
  );
}
