"use client";

import * as React from "react";
import { ExternalLink, Eye, EyeOff, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/common/copy-button";
import { OpenAILogo, AnthropicLogo, GeminiLogo } from "@/components/common/ai-logos";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";

const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL ?? "";
const CONNECTOR_NAME = "MoFin — Monitor your Finances";

const GEMINI_CLI_CONFIG = JSON.stringify(
  { mcpServers: { mofin: { url: MCP_URL } } },
  null,
  2,
);

const CLIENTS = [
  {
    key: "claude",
    label: "Claude",
    description: "Anthropic Claude — web, desktop & mobile",
    swatch: "bg-[#D97757] text-white",
    Logo: AnthropicLogo,
  },
  {
    key: "chatgpt",
    label: "ChatGPT",
    description: "OpenAI ChatGPT — custom connectors",
    swatch: "bg-white text-black",
    Logo: OpenAILogo,
  },
  {
    key: "gemini",
    label: "Gemini",
    description: "Google Gemini CLI & Enterprise",
    swatch: "bg-gradient-to-br from-[#4285f4] via-[#9b72cb] to-[#d96570] text-white",
    Logo: GeminiLogo,
  },
] as const;

type ClientKey = (typeof CLIENTS)[number]["key"] | "other";

export default function ConnectPage() {
  const { data: user } = useUser();
  const [revealed, setRevealed] = React.useState(false);
  const [active, setActive] = React.useState<ClientKey>("claude");

  const claudeDeepLink = MCP_URL
    ? `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(
        CONNECTOR_NAME,
      )}&connectorUrl=${encodeURIComponent(MCP_URL)}`
    : "";

  const activeClient = CLIENTS.find((c) => c.key === active);

  return (
    <div>
      {/* HERO */}
      <header className="mb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
            <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
            <span className="label-caps text-primary! tracking-widest!">MCP Ready</span>
          </div>
          <h1 className="font-heading text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">
            AI Connector Hub
          </h1>
          <p className="mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
            Bridging your financial data to your favorite AI assistants via the open{" "}
            <span className="text-primary underline decoration-primary/30">
              Model Context Protocol
            </span>{" "}
            (MCP).
          </p>
        </div>

        <div className="glass-panel w-full rounded-xl p-4 md:w-72">
          <div className="mb-3 flex items-center justify-between">
            <span className="label-caps">Your connector</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate font-mono text-xs text-primary">
              {revealed ? MCP_URL : "•".repeat(28)}
            </code>
            <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRevealed((r) => !r)}
                    >
                      {revealed ? <EyeOff /> : <Eye />}
                    </Button>
            <CopyButton value={MCP_URL} label="" className="px-2" />
          </div>
        </div>
      </header>

      {/* CONNECTOR GRID */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Client cards — logo-only row on mobile, full cards from lg up */}
        <div className="flex gap-3 lg:col-span-4 lg:flex-col lg:gap-4">
          {CLIENTS.map(({ key, label, description, swatch, Logo }) => {
            const isActive = active === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActive(key)}
                title={label}
                className={cn(
                  "glass-panel flex-1 rounded-2xl border-l-4 p-3 text-left transition-all duration-300 lg:w-full lg:flex-none lg:p-6 lg:hover:-translate-y-0.5",
                  isActive ? "border-l-primary" : "border-l-transparent",
                )}
              >
                <div className="flex items-center justify-center lg:mb-6 lg:items-start lg:justify-between">
                  <div
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl lg:size-12",
                      swatch,
                    )}
                  >
                    <Logo className="size-5 lg:size-6" />
                  </div>
                  {isActive && (
                    <span className="hidden rounded-lg bg-primary/15 px-2 py-1 lg:inline-block">
                      <span className="label-caps text-primary!">Selected</span>
                    </span>
                  )}
                </div>
                <h3 className="mt-3 hidden font-heading text-xl font-bold lg:block">{label}</h3>
                <p className="mt-1 hidden text-sm text-muted-foreground lg:block">{description}</p>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setActive("other")}
            title="Other MCP client"
            className={cn(
              "glass-panel flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed p-3 text-center transition-all duration-300 lg:w-full lg:flex-none lg:p-8 lg:hover:-translate-y-0.5",
              active === "other" ? "border-primary/50" : "border-border",
            )}
          >
            <div className="flex size-10 items-center justify-center rounded-full border border-border lg:mb-3 lg:size-12">
              <Plus className="size-4 text-muted-foreground lg:size-5" />
            </div>
            <h3 className="mt-3 hidden font-heading text-lg font-bold lg:block">Other MCP client</h3>
            <p className="hidden text-sm text-muted-foreground lg:block">
              Any assistant that supports remote MCP
            </p>
          </button>
        </div>

        {/* Workspace */}
        <div className="lg:col-span-8">
          <div className="glass-panel relative h-full overflow-hidden rounded-3xl p-6 sm:p-8">
            <div
              className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-primary/10 blur-3xl"
              aria-hidden
            />

            <div className="relative">
              <div className="mb-8 flex items-center gap-4">
                {activeClient ? (
                  <div
                    className={cn(
                      "flex size-10 items-center justify-center rounded-lg",
                      activeClient.swatch,
                    )}
                  >
                    <activeClient.Logo className="size-5" />
                  </div>
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-lg border border-dashed border-border">
                    <Plus className="size-5 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <h2 className="font-heading text-2xl font-bold">
                    {activeClient?.label ?? "Other MCP client"} configuration
                  </h2>
                  <p className="font-mono text-xs text-muted-foreground">
                    REMOTE_MCP_SERVER · OAUTH_2.0
                  </p>
                </div>
              </div>

              <div className="space-y-7">
                {/* Primary CTA */}
                {active === "claude" && (
                  <Button size="lg" className="w-full" asChild disabled={!claudeDeepLink}>
                    <a href={claudeDeepLink} target="_blank" rel="noopener noreferrer">
                      <AnthropicLogo className="size-4" />
                      Add to Claude
                    </a>
                  </Button>
                )}
                {active === "chatgpt" && (
                  <Button size="lg" className="w-full" asChild>
                    <a
                      href="https://chatgpt.com/#settings/Connectors"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink />
                      Open ChatGPT connector settings
                    </a>
                  </Button>
                )}

                {/* Endpoint */}
                <div>
                  <label className="label-caps text-primary! mb-3 block">MCP endpoint</label>
                  <div className="flex gap-2">
                    <Input
                      value={revealed ? MCP_URL : "•".repeat(32)}
                      readOnly
                      className="bg-muted/50 font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRevealed((r) => !r)}
                    >
                      {revealed ? <EyeOff /> : <Eye />}
                      {revealed ? "Hide" : "View"}
                    </Button>
                    <CopyButton value={MCP_URL} />
                  </div>
                </div>

                {/* Auth */}
                <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p className="text-sm text-muted-foreground">
                    No manual tokens — when {activeClient?.label ?? "the client"} connects,
                    it redirects you here to sign in as{" "}
                    <span className="font-medium text-foreground">
                      {user?.email ?? "your account"}
                    </span>{" "}
                    and approve access. Revoke it any time from the client&apos;s connector
                    settings.
                  </p>
                </div>

                {/* Setup instructions, per client */}
                <div>
                  <label className="label-caps text-primary! mb-4 block">Setup instructions</label>

                  {active === "claude" && (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Add to Claude opens Claude with the connector name and URL already
                        filled in — review and confirm in the dialog that opens.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Didn&apos;t work? Go to Claude → Settings → Connectors → Add custom
                        connector and paste the URL above.
                      </p>
                    </div>
                  )}

                  {active === "chatgpt" && (
                    <div className="space-y-4">
                      <div className="space-y-3">
                        {[
                          "Click the button above (Settings → Apps & Connectors on ChatGPT).",
                          "Click Create and choose Custom connector.",
                          "Paste the connector URL from above into the Server URL field, then save.",
                          "Click Connect — you'll be redirected here to sign in and approve access.",
                        ].map((step, i) => (
                          <div key={i} className="flex gap-3">
                            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                              {i + 1}
                            </div>
                            <p className="text-sm leading-relaxed text-muted-foreground">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {active === "gemini" && (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        The consumer Gemini app doesn&apos;t support custom MCP connectors yet.
                        If you use <span className="font-medium text-foreground">Gemini CLI</span>
                        , add this to{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs">
                          ~/.gemini/settings.json
                        </code>
                        :
                      </p>
                      <div className="flex items-start gap-2">
                        <pre className="flex-1 overflow-x-auto rounded-xl border border-border bg-muted/30 p-4 text-xs">
                          <code>{GEMINI_CLI_CONFIG}</code>
                        </pre>
                        <CopyButton value={GEMINI_CLI_CONFIG} />
                      </div>
                    </div>
                  )}

                  {active === "other" && (
                    <div className="space-y-3">
                      {[
                        "In your AI client, find the option to add a custom remote MCP server.",
                        "Paste the connector URL above as the server URL.",
                        "If prompted for an auth method, choose OAuth — the client will redirect you here to sign in and approve access.",
                      ].map((step, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                            {i + 1}
                          </div>
                          <p className="text-sm leading-relaxed text-muted-foreground">{step}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
