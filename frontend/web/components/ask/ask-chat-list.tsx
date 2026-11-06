"use client";

import * as React from "react";
import { MessageSquare, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiChats, useDeleteChat, useRenameChat } from "@/hooks/useAiChat";
import { localIso, addDaysIso } from "@/lib/week";
import { cn } from "@/lib/utils";
import type { AiChatSummary } from "@/lib/types";

export function groupChats(chats: AiChatSummary[], now: Date): { label: string; chats: AiChatSummary[] }[] {
  const today = localIso(now);
  const yesterday = addDaysIso(today, -1);
  const weekAgo = addDaysIso(today, -7);
  const groups = new Map<string, AiChatSummary[]>();
  for (const chat of chats) {
    const day = localIso(new Date(chat.updatedAt));
    const label =
      day >= today ? "Today" : day === yesterday ? "Yesterday" : day > weekAgo ? "Previous 7 days" : "Earlier";
    groups.set(label, [...(groups.get(label) ?? []), chat]);
  }
  return ["Today", "Yesterday", "Previous 7 days", "Earlier"]
    .filter((label) => groups.has(label))
    .map((label) => ({ label, chats: groups.get(label)! }));
}

function ChatRow({
  chat,
  active,
  onOpen,
  onDeleted,
}: {
  chat: AiChatSummary;
  active: boolean;
  onOpen: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const rename = useRenameChat();
  const remove = useDeleteChat();
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(chat.title);
  const [confirming, setConfirming] = React.useState(false);

  function save() {
    const next = title.trim();
    setEditing(false);
    if (next && next !== chat.title) rename.mutate({ id: chat.id, title: next });
    else setTitle(chat.title);
  }

  if (editing) {
    return (
      <li className="px-1 py-0.5">
        <Input
          autoFocus
          value={title}
          maxLength={80}
          aria-label="Chat name"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setTitle(chat.title);
              setEditing(false);
            }
          }}
          className="h-9"
        />
      </li>
    );
  }

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onOpen(chat.id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl py-2 pl-3 pr-10 text-left text-sm transition-colors pointer-coarse:min-h-11",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // The open chat sits raised like the conversation card it opens; the rest stay on the page.
          active
            ? "bg-card font-medium text-foreground shadow-surface"
            : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
        )}
      >
        <MessageSquare className="size-4 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{chat.title}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Options for ${chat.title}`}
            className={cn(
              "absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-coarse:size-9",
              // Always visible on touch and for the open chat; on hover elsewhere.
              !active &&
                "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100",
            )}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2 className="size-4" aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this chat?"
        description={`"${chat.title}" and its answers will be deleted. Your transactions and other data are not affected.`}
        confirmLabel="Delete chat"
        onConfirm={() => remove.mutate(chat.id, { onSuccess: () => onDeleted(chat.id) })}
      />
    </li>
  );
}

export function AskChatList({
  activeId,
  onOpen,
  onNew,
  onDeleted,
}: {
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDeleted: (id: string) => void;
}) {
  const { data, isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useAiChats();
  const chats = data?.pages.flatMap((p) => p.data) ?? [];
  // Grouping needs "now"; computed once per mount on the client.
  const [now] = React.useState(() => new Date());

  return (
    <nav aria-label="Saved chats" className="flex h-full min-h-0 flex-col">
      <Button onClick={onNew} className="w-full justify-start gap-2" variant="outline">
        <Plus className="size-4" aria-hidden />
        New chat
      </Button>
      <div className="relative mt-4 min-h-0 flex-1 overflow-y-auto pb-2 scrollbar-thin">
        {isLoading ? (
          <div className="space-y-2 px-1">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <p className="px-2 text-sm text-muted-foreground">
            Couldn&apos;t load your chats.{" "}
            <button type="button" onClick={() => refetch()} className="font-medium text-foreground underline">
              Try again
            </button>
          </p>
        ) : chats.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">Your chats are saved here, so you can come back to them.</p>
        ) : (
          <div className="space-y-4">
            {groupChats(chats, now).map((group) => (
              <section key={group.label} aria-label={group.label}>
                <h3 className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                  {group.label}
                </h3>
                <ul className="space-y-0.5">
                  {group.chats.map((chat) => (
                    <ChatRow
                      key={chat.id}
                      chat={chat}
                      active={chat.id === activeId}
                      onOpen={onOpen}
                      onDeleted={onDeleted}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {hasNextPage && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Loading…" : "Show older chats"}
              </Button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
