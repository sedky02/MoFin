import { router } from 'expo-router';
import { Spinner } from '@/components/ui/themed-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import type { AiChatSummary } from '@/core/types';
import { addDaysIso, localIso } from '@/core/week';
import { useAiChats, useDeleteChat, useRenameChat } from '@/hooks/useAiChat';
import { haptics } from '@/lib/haptics';
import { ChevronRight, Ellipsis, MessageCircle, PieChart, Plus, Target, TrendingUp, ChartColumn } from '@/lib/icons';

// Whole sentences, so it is plain what a tap asks. Each one tends to bring a chart. Same as the web.
export const SUGGESTIONS = [
  { icon: PieChart, text: 'Where did my money go this month?' },
  { icon: ChartColumn, text: 'Compare my income and expenses over the last 6 months' },
  { icon: TrendingUp, text: 'How has my balance changed in the last 30 days?' },
  { icon: Target, text: 'Am I on track with my goals?' },
];

export function groupChats(chats: AiChatSummary[], now: Date): { label: string; chats: AiChatSummary[] }[] {
  const today = localIso(now);
  const yesterday = addDaysIso(today, -1);
  const weekAgo = addDaysIso(today, -7);
  const groups = new Map<string, AiChatSummary[]>();
  for (const chat of chats) {
    const day = localIso(new Date(chat.updatedAt));
    const label = day >= today ? 'Today' : day === yesterday ? 'Yesterday' : day > weekAgo ? 'Previous 7 days' : 'Earlier';
    groups.set(label, [...(groups.get(label) ?? []), chat]);
  }
  return ['Today', 'Yesterday', 'Previous 7 days', 'Earlier'].filter((l) => groups.has(l)).map((label) => ({ label, chats: groups.get(label)! }));
}

export function openChat(id: string | 'new', question?: string) {
  router.push(question ? { pathname: '/ask/[id]', params: { id, q: question } } : { pathname: '/ask/[id]', params: { id } });
}

function ChatOptions({ chat, open, onOpenChange }: { chat: AiChatSummary; open: boolean; onOpenChange: (open: boolean) => void }) {
  const rename = useRenameChat();
  const remove = useDeleteChat();
  const [title, setTitle] = React.useState(chat.title);
  const [confirming, setConfirming] = React.useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chat options</DialogTitle>
            <DialogDescription>Rename this chat, or delete it.</DialogDescription>
          </DialogHeader>
          <Input value={title} onChangeText={setTitle} maxLength={80} accessibilityLabel="Chat name" className="min-h-11" />
          <DialogFooter className="gap-2">
            <Button
              disabled={!title.trim() || title.trim() === chat.title || rename.isPending}
              onPress={() => rename.mutate({ id: chat.id, title: title.trim() }, { onSuccess: () => onOpenChange(false) })}
              className="min-h-11">
              <Text>Save name</Text>
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              onPress={() => {
                onOpenChange(false);
                setConfirming(true);
              }}>
              <Text className="text-destructive">Delete chat</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this chat?"
        description={`"${chat.title}" and its answers will be deleted. Your transactions and other data are not affected.`}
        confirmLabel="Delete chat"
        onConfirm={() => remove.mutate(chat.id)}
      />
    </>
  );
}

function ChatRow({ chat, last }: { chat: AiChatSummary; last: boolean }) {
  const [options, setOptions] = React.useState(false);
  return (
    <View className={last ? 'flex-row items-center' : 'flex-row items-center border-b border-border/60'}>
      <Pressable
        role="link"
        accessibilityLabel={chat.title}
        accessibilityHint="Opens the chat"
        onPress={() => openChat(chat.id)}
        onLongPress={() => {
          haptics.tap();
          setOptions(true);
        }}
        className="min-h-14 flex-1 flex-row items-center gap-3 py-3 pl-4 active:bg-accent">
        <Icon as={MessageCircle} size={18} aria-hidden className="text-muted-foreground" />
        <Text numberOfLines={1} className="flex-1 text-base">
          {chat.title}
        </Text>
      </Pressable>
      <Pressable
        role="button"
        accessibilityLabel={`Options for ${chat.title}`}
        onPress={() => setOptions(true)}
        className="size-12 items-center justify-center active:bg-accent">
        <Icon as={Ellipsis} size={18} className="text-muted-foreground" />
      </Pressable>
      <ChatOptions chat={chat} open={options} onOpenChange={setOptions} />
    </View>
  );
}

export function AskChatList() {
  const { data, isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useAiChats();
  const chats = data?.pages.flatMap((p) => p.data) ?? [];
  const [now] = React.useState(() => new Date());

  return (
    <View className="gap-6">
      <View className="gap-3">
        <Button onPress={() => openChat('new')} className="min-h-12 gap-2" accessibilityLabel="New chat">
          <Icon as={Plus} size={18} className="text-primary-foreground" />
          <Text>New chat</Text>
        </Button>
        <Text className="px-1 text-sm text-muted-foreground">
          Answers come from your own data, with charts when a picture says it better. MoFin only reads; it never changes anything.
        </Text>
      </View>

      {!isLoading && chats.length === 0 ? (
        <View className="gap-2">
          <Text role="heading" aria-level={2} className="px-1 text-sm font-semibold text-muted-foreground">
            Try one
          </Text>
          <View accessibilityLabel="Suggested questions" className="overflow-hidden rounded-2xl border border-border bg-card">
            {SUGGESTIONS.map(({ icon, text }, i) => (
              <Pressable
                key={text}
                role="button"
                accessibilityLabel={`Ask: ${text}`}
                onPress={() => openChat('new', text)}
                className={i < SUGGESTIONS.length - 1 ? 'min-h-14 flex-row items-center gap-3 border-b border-border/60 px-4 py-3 active:bg-accent' : 'min-h-14 flex-row items-center gap-3 px-4 py-3 active:bg-accent'}>
                <View aria-hidden className="size-9 items-center justify-center rounded-full bg-chart-2/15">
                  <Icon as={icon} size={17} className="text-chart-2" />
                </View>
                <Text className="flex-1 text-base">{text}</Text>
                <Icon as={ChevronRight} size={16} aria-hidden className="text-muted-foreground" />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {isLoading ? (
        <View className="gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-2xl" />
          ))}
        </View>
      ) : isError ? (
        <View className="items-start gap-2 px-1">
          <Text className="text-sm text-muted-foreground">Couldn&apos;t load your chats.</Text>
          <Button variant="outline" size="sm" onPress={() => refetch()} className="min-h-11">
            <Text>Try again</Text>
          </Button>
        </View>
      ) : (
        groupChats(chats, now).map((group) => (
          <View key={group.label} className="gap-2">
            <Text role="heading" aria-level={2} className="px-1 text-sm font-semibold text-muted-foreground">
              {group.label}
            </Text>
            <View className="overflow-hidden rounded-2xl border border-border bg-card">
              {group.chats.map((chat, i) => (
                <ChatRow key={chat.id} chat={chat} last={i === group.chats.length - 1} />
              ))}
            </View>
          </View>
        ))
      )}

      {hasNextPage ? (
        <Button variant="ghost" onPress={() => fetchNextPage()} disabled={isFetchingNextPage} className="min-h-11">
          {isFetchingNextPage ? <Spinner /> : <Text>Show older chats</Text>}
        </Button>
      ) : null}
    </View>
  );
}
