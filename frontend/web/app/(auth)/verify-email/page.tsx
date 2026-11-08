"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, MailCheck, RotateCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTH_BUTTON, AUTH_INPUT, AUTH_LABEL, AUTH_LINK, AuthHeading, AuthSwitch } from "@/components/auth/auth-parts";
import { InboxButton, SentAddressCard } from "@/components/auth/email-sent";
import { Input } from "@/components/ui/input";
import { AuthBrokenLinkScene, AuthMailScene, AuthSuccessScene } from "@/components/auth/auth-scenes";
import { afterVerificationHref, forgetContinuation } from "@/lib/pending-signup";

type Status =
  | { kind: "ready"; token: string; fromApp: boolean }
  | { kind: "verifying"; token: string; fromApp: boolean }
  | { kind: "signedIn" }
  | { kind: "verified"; email: string; fromApp: boolean }
  | { kind: "invalid" };

const GHOST_BUTTON = "h-11 w-full text-[15px] font-semibold text-muted-foreground";

// Read once: the page then wipes the fragment from the address bar, which must not reset it.
let linkFragment: string | null = null;
function readLinkFragment(): string {
  linkFragment ??= window.location.hash.replace(/^#/, "");
  return linkFragment;
}

function noopSubscribe() {
  return () => {};
}

function statusFromFragment(fragment: string): Status {
  const params = new URLSearchParams(fragment);
  const token = params.get("token");
  return token ? { kind: "ready", token, fromApp: params.get("from") === "app" } : { kind: "invalid" };
}

export default function VerifyEmailPage() {
  // null on the server and during hydration, so the prerender matches.
  const fragment = React.useSyncExternalStore(noopSubscribe, readLinkFragment, () => null);
  const [outcome, setOutcome] = React.useState<Status | null>(null);
  const [continueHref, setContinueHref] = React.useState("/dashboard");

  React.useEffect(() => {
    // Out of the address bar and the back stack.
    if (fragment !== null) window.history.replaceState(null, "", window.location.pathname);
  }, [fragment]);

  // Verified on a tap, not on load: mail scanners that open links would otherwise use them up.
  async function verify(token: string, fromApp: boolean) {
    setOutcome({ kind: "verifying", token, fromApp });
    const res = await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { email?: string; signedIn?: boolean } | null) : null;
    if (!body) return setOutcome({ kind: "invalid" });
    if (body.signedIn) {
      setContinueHref(afterVerificationHref());
      forgetContinuation();
      return setOutcome({ kind: "signedIn" });
    }
    setOutcome({ kind: "verified", email: body.email ?? "", fromApp });
  }

  if (fragment === null) return <div aria-busy="true" className="min-h-64" />;
  const status = outcome ?? statusFromFragment(fragment);

  if (status.kind === "ready" || status.kind === "verifying") {
    const { token, fromApp } = status;
    return (
      <div className="text-center">
        <AuthMailScene className="mb-7" />
        <AuthHeading
          align="center"
          title="Verify your"
          accent="email"
          subtitle="One tap to confirm this address is yours and finish setting up your account."
        />
        <Button className={AUTH_BUTTON} disabled={status.kind === "verifying"} onClick={() => verify(token, fromApp)}>
          <MailCheck className="size-[18px]" aria-hidden />
          {status.kind === "verifying" ? "Verifying…" : "Verify my email"}
        </Button>
      </div>
    );
  }

  if (status.kind === "invalid") return <ExpiredLink />;


  if (status.kind === "signedIn") {
    return (
      <div className="text-center">
        <AuthSuccessScene className="mb-7" />
        <AuthHeading
          align="center"
          title="Your email is"
          accent="verified"
          subtitle="You're signed in and ready to go."
        />
        <Button className={AUTH_BUTTON} onClick={() => window.location.assign(continueHref)}>
          {continueHref === "/dashboard" ? "Go to dashboard" : "Continue"}
          <ArrowRight className="size-[18px]" aria-hidden />
        </Button>
      </div>
    );
  }

  const signInHref = `/login?email=${encodeURIComponent(status.email)}`;
  return (
    <div className="text-center">
      <AuthSuccessScene className="mb-7" />
      <AuthHeading
        align="center"
        title="Your email is"
        accent="verified"
        subtitle={
          status.fromApp
            ? "Go back to the MoFin app to carry on where you left off."
            : "Sign in with the password you chose to start using MoFin."
        }
      />
      {status.fromApp ? (
        <div className="flex flex-col gap-3.5">
          <Button asChild className={AUTH_BUTTON}>
            <a href={`mofin://verified?email=${encodeURIComponent(status.email)}`}>
              <Smartphone className="size-[18px]" aria-hidden />
              Open the MoFin app
            </a>
          </Button>
          <Button asChild variant="ghost" className={GHOST_BUTTON}>
            <Link href={signInHref}>Sign in on the web instead</Link>
          </Button>
        </div>
      ) : (
        <Button asChild className={AUTH_BUTTON}>
          <Link href={signInHref}>
            Sign in
            <ArrowRight className="size-[18px]" aria-hidden />
          </Link>
        </Button>
      )}
    </div>
  );
}

type ResendState = "idle" | "sending" | "sent" | "limited" | "failed";

/** A used or expired link can't say which address it was for, so ask for it right here. */
function ExpiredLink() {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<ResendState>("idle");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function sendNewLink(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setState("sending");
    const res = await fetch("/api/auth/verification/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    }).catch(() => null);
    if (res?.status === 429) return setState("limited");
    setState(res?.ok ? "sent" : "failed");
  }

  if (state === "sent") {
    return (
      <div className="text-center">
        <AuthMailScene className="mb-6" />
        <AuthHeading
          align="center"
          compact
          title="Check your"
          accent="email"
          subtitle={<span role="status">If this address is waiting to be verified, we sent it a new link:</span>}
        />
        <SentAddressCard
          email={email.trim()}
          meta="Expires in 24 hours · works once"
          action={
            <button type="button" className={AUTH_LINK} onClick={() => setState("idle")}>
              Change
            </button>
          }
        />
        <div className="mt-8 flex flex-col gap-3">
          <InboxButton email={email.trim()} />
        </div>
        <AuthSwitch className="mt-7">
          Already verified?{" "}
          <Link href={`/login?email=${encodeURIComponent(email.trim())}`} className={AUTH_LINK}>
            Sign in
          </Link>
        </AuthSwitch>
      </div>
    );
  }

  return (
    <div className="text-center">
      <AuthBrokenLinkScene className="mb-6" />
      <AuthHeading
        align="center"
        compact
        title="This link can't be"
        accent="used"
        subtitle={
          <span role="alert">It has expired or was already used. Enter your email and we&apos;ll send a new one.</span>
        }
      />
      <form onSubmit={sendNewLink} className="space-y-4 text-left" noValidate>
        <div className="grid gap-2">
          <label htmlFor="resend-email" className={AUTH_LABEL}>
            Email
          </label>
          <Input
            id="resend-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className={AUTH_INPUT}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <Button type="submit" className={AUTH_BUTTON} disabled={!valid || state === "sending"}>
          <RotateCw className="size-4" aria-hidden />
          {state === "sending" ? "Sending…" : "Send a new link"}
        </Button>
      </form>
      <p role="status" className="mt-3 min-h-5 text-sm">
        {state === "limited" && <span className="text-destructive">Too many attempts. Try again in a few minutes.</span>}
        {state === "failed" && <span className="text-destructive">Couldn&apos;t send it. Try again.</span>}
      </p>
      <AuthSwitch className="mt-5">
        Already verified?{" "}
        <Link href="/login" className={AUTH_LINK}>
          Sign in
        </Link>
      </AuthSwitch>
    </div>
  );
}
