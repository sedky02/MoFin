"use client";

import * as React from "react";
import { BarChart3, History, PieChart, Plus, Target, TrendingUp } from "lucide-react";
import { AskChatList } from "@/components/ask/ask-chat-list";
import { AskComposer } from "@/components/ask/ask-composer";
import { LogoMark } from "@/components/brand/logo";
import { AssistantMessage, FailedMessage, ThinkingMessage, UserMessage } from "@/components/ask/ask-message";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { chatErrorMessage, useAiChatDetail, useSendChatMessage } from "@/hooks/useAiChat";
import { useChatParam } from "@/hooks/use-chat-param";
import { ApiClientError } from "@/lib/api";

// Short enough for one chip each; each one tends to bring a chart.
const SUGGESTIONS = [
  { icon: PieChart, text: "Where did my money go this month?" },
  { icon: BarChart3, text: "Income vs expenses, last 6 months" },
  { icon: TrendingUp, text: "My balance over the last 30 days" },
  { icon: Target, text: "Am I on track with my goals?" },
];

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex min-h-[calc(100%-1rem)] flex-col items-center justify-center py-10 text-center">
      <LogoMark className="size-10" />
      <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">Ask about your money</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">Answers from your own data, with charts.</p>
      <ul aria-label="Suggested questions" className="mt-7 flex max-w-2xl flex-wrap justify-center gap-2">
        {SUGGESTIONS.map(({ icon: Icon, text }) => (
          <li key={text}>
            <button
              type="button"
              onClick={() => onPick(text)}
              className="flex items-center gap-2 rounded-full bg-secondary/70 px-3.5 py-2 text-sm transition-[background-color,transform] duration-100 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] motion-reduce:active:scale-100 pointer-coarse:min-h-11"
            >
              <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              {text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-6" aria-label="Loading chat">
      <Skeleton className="ml-auto h-11 w-2/3 rounded-3xl" />
      <div className="flex gap-3">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/** The server keeps each chat's history; this only sends the new question and shows what comes back. */
export function AskView() {
  const [chatId, setChatId] = useChatParam();
  const detail = useAiChatDetail(chatId);
  const send = useSendChatMessage();
  const [input, setInput] = React.useState("");
  // The question in flight (shown at once) or the one that failed (with a retry).
  const [pending, setPending] = React.useState<{
    chatId: string | null;
    content: string;
    error?: string;
  } | null>(null);
  const [listOpen, setListOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  // Where the user is now, read when an answer lands (they may have moved on).
  const currentChat = React.useRef(chatId);
  React.useEffect(() => {
    currentChat.current = chatId;
  }, [chatId]);

  const messages = detail.data?.messages ?? [];
  const showPending = pending && pending.chatId === chatId;

  // Follow the conversation to its newest message. Not on the welcome screen, which reads from the top.
  const hasThread = messages.length > 0 || Boolean(showPending);
  React.useEffect(() => {
    if (hasThread) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, showPending, chatId, hasThread]);

  async function ask(text: string) {
    const content = text.trim();
    if (!content || send.isPending) return;
    const target = chatId;
    setPending({ chatId: target, content });
    setInput("");
    try {
      const turn = await send.mutateAsync({ chatId: target, content });
      setPending(null);
      // A new chat gets its id now; follow it only if the user is still on it.
      if (!target && currentChat.current === null) setChatId(turn.chat.id);
    } catch (err) {
      setPending({ chatId: target, content, error: chatErrorMessage(err) });
      // A chat deleted elsewhere: the next question starts a new one.
      if (err instanceof ApiClientError && err.status === 404 && target) setChatId(null);
    }
  }

  function retry() {
    if (pending) void ask(pending.content);
  }

  function openChat(id: string | null) {
    setChatId(id);
    setListOpen(false);
    if (!send.isPending) setPending(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const list = (
    <AskChatList
      activeId={chatId}
      onOpen={openChat}
      onNew={() => openChat(null)}
      onDeleted={(id) => {
        if (id === chatId) openChat(null);
      }}
    />
  );

  const title = chatId ? (detail.data?.title ?? "") : "New chat";
  const empty = !chatId && !showPending;

  return (
    // Fills the screen under the header; only the thread scrolls. Three layers (list, conversation
    // card, inset charts) with concentric corners: inner radius = outer minus the gap.
    <div className="-mt-2 grid h-[calc(100dvh-10.5rem)] min-h-[26rem] gap-5 lg:h-[calc(100dvh-7rem)] lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 pt-1 lg:block">{list}</aside>

      <section
        aria-label="Chat"
        className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[1rem] bg-card shadow-hero lg:rounded-[1.25rem]"
      >
        <header className="relative z-10 flex items-center gap-2 px-3 pb-2 pt-3 sm:px-5 sm:pt-4">
          <Sheet open={listOpen} onOpenChange={setListOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden pointer-coarse:size-11" aria-label="Saved chats">
                <History className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 max-w-[85vw] p-4 pt-12">
              <SheetTitle className="sr-only">Saved chats</SheetTitle>
              <SheetDescription className="sr-only">Open a saved chat or start a new one.</SheetDescription>
              {list}
            </SheetContent>
          </Sheet>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-[-0.015em]">
            {title || <Skeleton className="h-5 w-48" />}
          </h1>
          {chatId && (
            <Button variant="outline" size="sm" onClick={() => openChat(null)} className="gap-1.5 lg:hidden">
              <Plus className="size-4" aria-hidden />
              New
            </Button>
          )}
        </header>

        {/* The thread fades out under the header and above the question box, instead of meeting
            hard divider lines. */}
        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 [mask-image:linear-gradient(to_bottom,transparent,black_1.25rem,black_calc(100%-1.25rem),transparent)] sm:px-6">
          {empty ? (
            <Welcome onPick={(text) => void ask(text)} />
          ) : chatId && detail.isLoading ? (
            <ThreadSkeleton />
          ) : chatId && detail.isError && !showPending ? (
            <div className="mx-auto max-w-md py-16 text-center text-sm text-muted-foreground">
              <p>
                {detail.error instanceof ApiClientError && detail.error.status === 404
                  ? "This chat no longer exists."
                  : "Couldn't load this chat."}
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => detail.refetch()}>
                  Try again
                </Button>
                <Button size="sm" onClick={() => openChat(null)}>
                  New chat
                </Button>
              </div>
            </div>
          ) : (
            <ol aria-label="Conversation" className="mx-auto w-full max-w-3xl space-y-6 py-6">
              {messages.map((m) =>
                m.role === "user" ? (
                  <UserMessage key={m.id} content={m.content} createdAt={m.createdAt} />
                ) : (
                  <AssistantMessage key={m.id} message={m} />
                ),
              )}
              {showPending && <UserMessage content={pending.content} />}
              {showPending && !pending.error && <ThinkingMessage />}
              {showPending && pending.error && <FailedMessage error={pending.error} onRetry={retry} />}
            </ol>
          )}
          <div ref={endRef} aria-hidden className="h-4" />
        </div>

        {/* Announces the answer politely: it arrives after a few seconds. */}
        <p role="status" aria-live="polite" className="sr-only">
          {send.isPending ? "MoFin is looking at your data." : ""}
        </p>

        {/* The question box is docked into the bottom of the card: part of it, not floating over it.
            6px in from the card's edge on phones, so its corners nest inside the card's. */}
        <div className="shrink-0 px-1.5 pb-1.5 sm:px-5 sm:pb-4">
          <div className="mx-auto w-full max-w-3xl">
            <AskComposer
              value={input}
              onChange={setInput}
              onSend={() => void ask(input)}
              pending={send.isPending}
              inputRef={inputRef}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
