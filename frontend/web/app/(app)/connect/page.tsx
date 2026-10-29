"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/common/copy-button";
import { CONNECTOR_BRAND } from "@/components/common/connector-logo";
import { PageHeader } from "@/components/common/page-header";
import { useConnectedApps } from "@/hooks/useConnectedApps";
import { useUser } from "@/hooks/useUser";
import { connectedStates } from "@/lib/connected-apps";

const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL ?? "";
const NOT_AVAILABLE = "The AI connector isn't available on this server yet.";
const CONNECTOR_NAME = "MoFin — Monitor your Finances";
const CHATGPT_SETTINGS_URL = "https://chatgpt.com/#settings/Connectors";

const GEMINI_CLI_CONFIG = JSON.stringify({ mcpServers: { mofin: { url: MCP_URL } } }, null, 2);

const CLIENTS = [
  { key: "claude", label: "Claude", Logo: CONNECTOR_BRAND.claude.Logo },
  { key: "chatgpt", label: "ChatGPT", Logo: CONNECTOR_BRAND.chatgpt.Logo },
  { key: "gemini", label: "Gemini", Logo: CONNECTOR_BRAND.gemini.Logo },
  { key: "other", label: "Other", Logo: null },
] as const;

type ClientKey = (typeof CLIENTS)[number]["key"];

/** A numbered step: what to do, a line of detail, and optionally the button or snippet that does it. */
function Step({
  n,
  title,
  children,
  action,
}: {
  n: number;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold tabular"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 pb-6 last:pb-0">
        <h3 className="text-sm font-medium leading-7">{title}</h3>
        {children && <div className="text-sm text-muted-foreground">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </li>
  );
}

export default function ConnectPage() {
  const { data: user } = useUser();
  const apps = useConnectedApps();
  const [active, setActive] = React.useState<ClientKey>("claude");

  // The demo can't connect an app (the backend refuses it), so don't send the
  // visitor off to an assistant for nothing; the same goes for a server with no URL.
  const unavailable = !MCP_URL || !!user?.isDemo;
  const connected = connectedStates(apps.data);
  const activeClient = CLIENTS.find((c) => c.key === active);
  const activeLabel = active === "other" ? "another MCP client" : (activeClient?.label ?? "");
  const appName = active === "other" ? "An app" : (activeClient?.label ?? "An app");
  const activeState = connected[active];
  const describedBy = unavailable ? "connect-unavailable" : undefined;

  const claudeDeepLink = MCP_URL
    ? `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(
        CONNECTOR_NAME,
      )}&connectorUrl=${encodeURIComponent(MCP_URL)}`
    : "";

  /** The button that opens an assistant's settings: a link out, or a real disabled button when it can't be used. */
  function openButton(label: string, href: string, icon?: React.ReactNode) {
    return unavailable ? (
      <Button size="lg" disabled aria-describedby={describedBy}>
        {icon}
        {label}
      </Button>
    ) : (
      <Button size="lg" asChild>
        <a href={href} target="_blank" rel="noopener noreferrer">
          {icon}
          {label}
          <ExternalLink aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </Button>
    );
  }

  const ClaudeLogo = CONNECTOR_BRAND.claude.Logo;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Connect an AI assistant"
        description="Let Claude, ChatGPT or another assistant read your balances and suggest transactions. Anything it suggests stays a draft until you approve it."
      />

      {unavailable && (
        <p
          id="connect-unavailable"
          role="status"
          className="mb-6 rounded-xl border border-border bg-accent px-4 py-3 text-sm text-accent-foreground"
        >
          {user?.isDemo
            ? "Connecting an AI app isn't available in the demo. Create your own account to connect Claude, ChatGPT or Gemini to your data."
            : NOT_AVAILABLE}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Card className="gap-0 border-0 p-5 sm:p-6">
          {/* The URL every assistant needs, shown once. */}
          <div>
            <label htmlFor="mcp-endpoint" className="text-sm font-medium">
              Connector URL
            </label>
            <div className="mt-2 flex gap-2">
              <Input
                id="mcp-endpoint"
                value={MCP_URL || "Not available"}
                readOnly
                className="bg-muted/50 font-mono text-xs"
              />
              {MCP_URL && <CopyButton value={MCP_URL} ariaLabel="Copy connector URL" />}
            </div>
          </div>

          <Tabs value={active} onValueChange={(v) => setActive(v as ClientKey)} className="mt-6 gap-0">
            <TabsList className="h-auto! w-full">
              {CLIENTS.map(({ key, label, Logo }) => (
                <TabsTrigger key={key} value={key} className="h-auto flex-col gap-1 py-2 sm:flex-row sm:gap-2">
                  {Logo && <Logo aria-hidden className="size-4" />}
                  {label}
                  {connected[key] && (
                    <>
                      <span aria-hidden className="size-1.5 rounded-full bg-success" />
                      <span className="sr-only">(connected)</span>
                    </>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            <h2 className="mt-6 text-base font-semibold">Set up {activeLabel}</h2>

            {!unavailable && activeState && (
              <p className="mt-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm">
                {activeState === "active"
                  ? `${appName} is connected to your account.`
                  : `${appName} was approved but isn't signed in right now. Add it again to reconnect.`}{" "}
                <Link
                  href="/settings#connected-apps"
                  className="font-medium text-primary-text underline-offset-4 hover:underline"
                >
                  Manage in Settings
                </Link>
              </p>
            )}

            <TabsContent value="claude" className="mt-5">
              <ol>
                <Step
                  n={1}
                  title="Add MoFin to Claude"
                  action={openButton("Add to Claude", claudeDeepLink, <ClaudeLogo aria-hidden className="size-4" />)}
                >
                  This opens Claude with the connector name and URL already filled in.
                </Step>
                <Step n={2} title="Confirm in Claude">
                  Review the details in the dialog that opens, then confirm.
                </Step>
                <Step n={3} title="Sign in and approve">
                  Claude sends you back here to sign in
                  {user && !user.isDemo ? (
                    <>
                      {" "}
                      as <span className="font-medium text-foreground">{user.email}</span>
                    </>
                  ) : null}{" "}
                  and approve access.
                </Step>
              </ol>
              <p className="mt-5 text-sm text-muted-foreground">
                Didn&apos;t work? In Claude go to Settings → Connectors → Add custom connector and paste the URL above.
              </p>
            </TabsContent>

            <TabsContent value="chatgpt" className="mt-5">
              <ol>
                <Step
                  n={1}
                  title="Open ChatGPT's connector settings"
                  action={openButton("Open ChatGPT connector settings", CHATGPT_SETTINGS_URL)}
                >
                  That is Settings → Apps &amp; Connectors in ChatGPT.
                </Step>
                <Step n={2} title="Create a custom connector">
                  Click Create and choose Custom connector.
                </Step>
                <Step n={3} title="Paste the connector URL">
                  Paste the URL above into the Server URL field, then save.
                </Step>
                <Step n={4} title="Connect">
                  Click Connect — you&apos;ll be redirected here to sign in and approve access.
                </Step>
              </ol>
            </TabsContent>

            <TabsContent value="gemini" className="mt-5">
              <p className="mb-5 text-sm text-muted-foreground">
                The consumer Gemini app doesn&apos;t support custom MCP connectors yet. If you use{" "}
                <span className="font-medium text-foreground">Gemini CLI</span>, you can add MoFin to its settings file.
              </p>
              <ol>
                <Step n={1} title="Open the settings file">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">~/.gemini/settings.json</code>
                </Step>
                <Step n={2} title="Add this configuration">
                  <div className="relative mt-1">
                    <pre className="overflow-x-auto rounded-xl border border-border bg-muted/30 p-4 pr-20 text-xs">
                      <code>{GEMINI_CLI_CONFIG}</code>
                    </pre>
                    <CopyButton
                      value={GEMINI_CLI_CONFIG}
                      ariaLabel="Copy the Gemini CLI configuration"
                      className="absolute right-2 top-2"
                    />
                  </div>
                </Step>
              </ol>
            </TabsContent>

            <TabsContent value="other" className="mt-5">
              <ol>
                <Step n={1} title="Find the connector option">
                  In your AI client, look for the option to add a custom remote MCP server.
                </Step>
                <Step n={2} title="Paste the connector URL">
                  Paste the URL above as the server URL.
                </Step>
                <Step n={3} title="Choose OAuth">
                  If it asks for an auth method, choose OAuth — the client will redirect you here to sign in and approve
                  access.
                </Step>
              </ol>
            </TabsContent>
          </Tabs>
        </Card>

        <aside aria-labelledby="how-access-works">
          <Card className="gap-0 border-0 p-5 sm:p-6 lg:sticky lg:top-20">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-text"
              >
                <ShieldCheck className="size-5" />
              </span>
              <h2 id="how-access-works" className="text-base font-semibold">
                How access works
              </h2>
            </div>
            <ul className="mt-4 space-y-4 text-sm text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">Suggestions only.</span> An assistant can read your
                balances and propose transactions, but each one waits as a draft until you approve it.
              </li>
              <li>
                <span className="font-medium text-foreground">No keys to paste.</span> You sign in here with your MoFin
                account, so the assistant never sees your password.
              </li>
              <li>
                <span className="font-medium text-foreground">You stay in control.</span> Disconnect any time under{" "}
                <Link
                  href="/settings#connected-apps"
                  className="font-medium text-primary-text underline-offset-4 hover:underline"
                >
                  Settings → Connected AI apps
                </Link>
                .
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
