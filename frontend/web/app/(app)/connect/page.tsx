"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, EyeOff, ShieldCheck, Undo2, type LucideIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";

const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL ?? "";
const NOT_AVAILABLE = "The AI connector isn't available on this server yet.";
const CONNECTOR_NAME = "MoFin — Monitor your Finances";
const CHATGPT_SETTINGS_URL = "https://chatgpt.com/#settings/Connectors";

const GEMINI_CLI_CONFIG = JSON.stringify({ mcpServers: { mofin: { url: MCP_URL } } }, null, 2);

const CLIENTS = [
  { key: "claude", label: "Claude", hint: "Web, desktop and mobile", brand: CONNECTOR_BRAND.claude },
  { key: "chatgpt", label: "ChatGPT", hint: "Custom connectors", brand: CONNECTOR_BRAND.chatgpt },
  { key: "gemini", label: "Gemini", hint: "Gemini CLI", brand: CONNECTOR_BRAND.gemini },
  { key: "other", label: "Other", hint: "Any remote MCP client", brand: null },
] as const;

type ClientKey = (typeof CLIENTS)[number]["key"];

const TRUST: { Icon: LucideIcon; title: string; body: React.ReactNode }[] = [
  {
    Icon: ShieldCheck,
    title: "Suggestions only",
    body: "It can read balances and propose transactions. Each one waits as a draft until you approve it.",
  },
  {
    Icon: EyeOff,
    title: "No keys to paste",
    body: "You sign in here with your MoFin account. The assistant never sees your password.",
  },
  {
    Icon: Undo2,
    title: "Easy to undo",
    body: (
      <>
        Disconnect any time under{" "}
        <Link href="/settings#connected-apps" className="font-medium text-primary-text underline-offset-4 hover:underline">
          Settings → Connected AI apps
        </Link>
        .
      </>
    ),
  },
];

/** The connector URL with its copy button, for the steps that ask you to paste it somewhere. */
function UrlField({ label = "Connector URL" }: { label?: string }) {
  const id = React.useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="mt-1.5 flex gap-2">
        <Input id={id} value={MCP_URL || "Not available"} readOnly className="bg-muted/50 font-mono text-xs" />
        {MCP_URL && <CopyButton value={MCP_URL} ariaLabel="Copy connector URL" />}
      </div>
    </div>
  );
}

/** Steps on a vertical line, so the order reads at a glance. */
function Steps({ children }: { children: React.ReactNode }) {
  return (
    <ol className="relative space-y-6 before:absolute before:bottom-3 before:left-3.5 before:top-3 before:w-px before:bg-border">
      {children}
    </ol>
  );
}

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
    <li className="relative flex gap-4">
      <span
        aria-hidden
        className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold tabular text-muted-foreground ring-4 ring-card"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium leading-7">{title}</h3>
        {children && <div className="mt-0.5 text-sm text-muted-foreground">{children}</div>}
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
  const activeClient = CLIENTS.find((c) => c.key === active)!;
  const activeState = connected[active];
  const appName = active === "other" ? "An app" : activeClient.label;
  const describedBy = unavailable ? "connect-unavailable" : undefined;

  const claudeDeepLink = MCP_URL
    ? `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(
        CONNECTOR_NAME,
      )}&connectorUrl=${encodeURIComponent(MCP_URL)}`
    : "";

  /** The button that opens an assistant's settings: a link out, or a real disabled button when it can't be used. */
  function openButton(label: string, href: string, icon?: React.ReactNode) {
    return unavailable ? (
      <Button size="lg" disabled aria-describedby={describedBy} className="w-full sm:w-auto">
        {icon}
        {label}
      </Button>
    ) : (
      <Button size="lg" asChild className="w-full sm:w-auto">
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
  const ActiveLogo = activeClient.brand?.Logo;

  return (
    <div className="mx-auto max-w-3xl">
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

      <Tabs value={active} onValueChange={(v) => setActive(v as ClientKey)} className="gap-4">
        {/* The one decision up front: which assistant. */}
        <TabsList
          variant="line"
          aria-label="Assistant"
          className="grid h-auto! w-full grid-cols-2 items-stretch gap-2 sm:grid-cols-4"
        >
          {CLIENTS.map(({ key, label, brand }) => {
            const Logo = brand?.Logo;
            return (
              <TabsTrigger
                key={key}
                value={key}
                className={cn(
                  "h-auto! justify-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left text-sm font-medium text-foreground after:hidden",
                  "hover:border-muted-foreground/40",
                  "data-active:border-primary data-active:bg-primary/5 data-active:ring-1 data-active:ring-primary/40",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg",
                    brand ? brand.swatch : "border border-dashed border-border text-muted-foreground",
                  )}
                >
                  {Logo ? <Logo aria-hidden className="size-[18px]" /> : <span className="leading-none">+</span>}
                </span>
                {label}
                {connected[key] && (
                  <>
                    <span aria-hidden className="ml-auto size-2 rounded-full bg-success" />
                    <span className="sr-only">(Connected)</span>
                  </>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <Card className="gap-0 border-0 p-5 sm:p-7">
          <div className="flex items-center gap-3.5">
            <span
              aria-hidden
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl",
                activeClient.brand ? activeClient.brand.swatch : "border border-dashed border-border text-muted-foreground",
              )}
            >
              {ActiveLogo ? <ActiveLogo aria-hidden className="size-5" /> : <span className="leading-none">+</span>}
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight tracking-tight">
                {active === "other" ? "Connect another MCP client" : `Connect ${activeClient.label}`}
              </h2>
              <p className="text-sm text-muted-foreground">{activeClient.hint}</p>
            </div>
          </div>

          {!unavailable && activeState && (
            <p className="mt-5 flex items-start gap-2 text-sm">
              <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-success" />
              <span>
                {activeState === "active"
                  ? `${appName} is connected to your account.`
                  : `${appName} was approved but isn't signed in right now. Add it again to reconnect.`}{" "}
                <Link
                  href="/settings#connected-apps"
                  className="font-medium text-primary-text underline-offset-4 hover:underline"
                >
                  Manage in Settings
                </Link>
              </span>
            </p>
          )}

          <div className="mt-6">
            <TabsContent value="claude">
              <Steps>
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
              </Steps>
              <details className="mt-6 text-sm">
                <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                  Didn&apos;t work? Add it by hand
                </summary>
                <p className="mb-3 mt-2 text-muted-foreground">
                  In Claude go to Settings → Connectors → Add custom connector and paste this URL.
                </p>
                <UrlField />
              </details>
            </TabsContent>

            <TabsContent value="chatgpt">
              <Steps>
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
                <Step n={3} title="Paste the connector URL" action={<UrlField label="Server URL to paste" />}>
                  Paste it into the Server URL field, then save.
                </Step>
                <Step n={4} title="Connect">
                  Click Connect — you&apos;ll be redirected here to sign in and approve access.
                </Step>
              </Steps>
            </TabsContent>

            <TabsContent value="gemini">
              <p className="mb-6 text-sm text-muted-foreground">
                The consumer Gemini app doesn&apos;t support custom MCP connectors yet. If you use{" "}
                <span className="font-medium text-foreground">Gemini CLI</span>, you can add MoFin to its settings file.
              </p>
              <Steps>
                <Step n={1} title="Open the settings file">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">~/.gemini/settings.json</code>
                </Step>
                <Step
                  n={2}
                  title="Add this configuration"
                  action={
                    <div className="relative">
                      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-4 pr-20 text-xs">
                        <code>{GEMINI_CLI_CONFIG}</code>
                      </pre>
                      <CopyButton
                        value={GEMINI_CLI_CONFIG}
                        ariaLabel="Copy the Gemini CLI configuration"
                        className="absolute right-2 top-2"
                      />
                    </div>
                  }
                />
              </Steps>
            </TabsContent>

            <TabsContent value="other">
              <Steps>
                <Step n={1} title="Find the connector option">
                  In your AI client, look for the option to add a custom remote MCP server.
                </Step>
                <Step n={2} title="Paste the connector URL" action={<UrlField />}>
                  Use it as the server URL.
                </Step>
                <Step n={3} title="Choose OAuth">
                  If it asks for an auth method, choose OAuth — the client will redirect you here to sign in and approve
                  access.
                </Step>
              </Steps>
            </TabsContent>
          </div>

          {/* What the assistant can and can't do, as a quiet footer rather than a second card. */}
          <section aria-labelledby="how-access-works" className="mt-8 border-t border-border pt-6">
            <h2 id="how-access-works" className="sr-only">
              How access works
            </h2>
            <ul className="grid gap-5 sm:grid-cols-3">
              {TRUST.map(({ Icon, title, body }) => (
                <li key={title}>
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="size-4 text-primary-text" aria-hidden />
                    {title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </li>
              ))}
            </ul>
          </section>
        </Card>
      </Tabs>
    </div>
  );
}
