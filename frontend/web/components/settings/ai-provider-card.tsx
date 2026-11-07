"use client";

import * as React from "react";
import { KeyRound, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { HelpHint } from "@/components/common/help-hint";
import { SettingsCard } from "@/components/settings/settings-card";
import {
  useAiCredentials,
  useRemoveAiKey,
  useSaveAiKey,
  useUpdateAiPreferences,
  type AiProviderId,
  type AiProviderStatus,
} from "@/hooks/useAiCredentials";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

export const AI_PROVIDER_COPY = {
  description: "Choose which assistant answers your questions and drafts transactions from what you write.",
  keyHelp:
    "Your key is encrypted on our server and used only to send your own requests to the provider you chose. It is never shown again, only its last four characters. Remove it here at any time.",
  fallbackHelp:
    "If your provider refuses your key or is down, MoFin can answer that one request with its own shared assistant (hosted on Groq). Your question and the figures it needs then go to that service instead of the provider you chose. Turn this off to see an error instead.",
  demo: "Not available in the demo. Create your own account to use your own AI key.",
  unavailable: "Storing your own key isn't set up on this server.",
} as const;

function KeyForm({
  provider,
  onDone,
}: {
  provider: AiProviderStatus;
  onDone: () => void;
}) {
  const save = useSaveAiKey();
  const [apiKey, setApiKey] = React.useState("");
  const [model, setModel] = React.useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    save.mutate(
      { provider: provider.provider, apiKey: apiKey.trim(), model: model.trim() || undefined },
      {
        onSuccess: () => {
          // The key leaves this component's memory as soon as it is saved.
          setApiKey("");
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-border bg-muted/30 p-3">
      <div className="space-y-1.5">
        <label htmlFor={`ai-key-${provider.provider}`} className="text-sm font-medium">
          {provider.label} API key
        </label>
        <Input
          id={`ai-key-${provider.provider}`}
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={8}
          className="font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`ai-model-${provider.provider}`} className="text-sm font-medium">
          Model <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          id={`ai-model-${provider.provider}`}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={provider.model ?? provider.defaultModel}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending || apiKey.trim().length < 8} className="gap-2">
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {save.isPending ? "Checking key…" : "Save key"}
        </Button>
      </div>
    </form>
  );
}

export function AiProviderCard({ user, isLoading }: { user?: User; isLoading: boolean }) {
  const demo = !isLoading && !!user?.isDemo;
  const credentials = useAiCredentials(!isLoading && !demo);
  const update = useUpdateAiPreferences();
  const remove = useRemoveAiKey();
  const [editing, setEditing] = React.useState<AiProviderId | null>(null);
  const [toRemove, setToRemove] = React.useState<AiProviderStatus | undefined>();

  const data = credentials.data;
  const sharedActive = data?.activeProvider == null;

  return (
    <SettingsCard
      id="ai-provider"
      title="AI provider"
      icon={Sparkles}
      description={demo ? AI_PROVIDER_COPY.demo : AI_PROVIDER_COPY.description}
      action={demo ? undefined : <HelpHint label="How your key is kept">{AI_PROVIDER_COPY.keyHelp}</HelpHint>}
    >
      {demo ? null : isLoading || credentials.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : credentials.isError || !data ? (
        <p className="text-sm text-destructive">Couldn&apos;t load your AI provider settings.</p>
      ) : (
        <div className="space-y-4">
          {!data.available && <p className="text-sm text-muted-foreground">{AI_PROVIDER_COPY.unavailable}</p>}
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border" aria-label="AI providers">
            <li className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">MoFin assistant</p>
                <p className="text-xs text-muted-foreground">Shared, no key needed</p>
              </div>
              {sharedActive ? (
                <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                  In use
                </Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ activeProvider: null })}
                >
                  Use
                </Button>
              )}
            </li>
            {data.providers.map((p) => {
              const active = data.activeProvider === p.provider;
              return (
                <li key={p.provider}>
                  <div className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.label}</p>
                      <p className={cn("text-xs text-muted-foreground", p.connected && "tabular")}>
                        {p.connected ? `Key •••• ${p.last4} · ${p.model ?? p.defaultModel}` : "No key added"}
                      </p>
                    </div>
                    {active && (
                      <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                        In use
                      </Badge>
                    )}
                    {p.connected && !active && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ activeProvider: p.provider })}
                        aria-label={`Use ${p.label}`}
                      >
                        Use
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!data.available}
                      onClick={() => setEditing(editing === p.provider ? null : p.provider)}
                      aria-expanded={editing === p.provider}
                      aria-label={`${p.connected ? "Replace" : "Add"} ${p.label} key`}
                      className="gap-1.5"
                    >
                      <KeyRound className="size-4" aria-hidden />
                      {p.connected ? "Replace" : "Add key"}
                    </Button>
                    {p.connected && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${p.label} key`}
                        onClick={() => setToRemove(p)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  {editing === p.provider && <KeyForm provider={p} onDone={() => setEditing(null)} />}
                </li>
              );
            })}
          </ul>

          {!sharedActive && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-1">
                <label htmlFor="ai-fallback" className="text-sm font-medium">
                  If my key fails, use MoFin&apos;s shared assistant
                </label>
                <HelpHint label="What the fallback sends">{AI_PROVIDER_COPY.fallbackHelp}</HelpHint>
              </div>
              <Switch
                id="ai-fallback"
                checked={data.fallbackEnabled}
                disabled={update.isPending}
                onCheckedChange={(checked) => update.mutate({ fallbackEnabled: checked })}
              />
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(open) => !open && setToRemove(undefined)}
        title={`Remove your ${toRemove?.label ?? ""} key?`}
        description={
          toRemove && data?.activeProvider === toRemove.provider
            ? "Questions will go back to MoFin's shared assistant. You can add a key again later."
            : "You can add a key again later."
        }
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (toRemove) remove.mutate(toRemove.provider);
          setToRemove(undefined);
        }}
      />
    </SettingsCard>
  );
}
