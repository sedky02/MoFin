"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, MailCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTH_BUTTON, AuthHeading } from "@/components/auth/auth-parts";
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

  if (status.kind === "invalid") {
    return (
      <div className="text-center">
        <AuthBrokenLinkScene className="mb-7" />
        <AuthHeading align="center" title="This link can't be" accent="used" />
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-left text-sm leading-relaxed text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>It may have expired or already been used. Sign in to get a new one.</span>
        </div>
        <Button asChild variant="outline" className={`${AUTH_BUTTON} mt-11`}>
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

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
