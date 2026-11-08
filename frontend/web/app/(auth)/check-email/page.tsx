"use client";

import * as React from "react";
import Link from "next/link";
import { AUTH_LINK, AuthHeading, AuthSwitch } from "@/components/auth/auth-parts";
import { AuthMailScene } from "@/components/auth/auth-scenes";
import { InboxButton, RESEND_COOLDOWN_S, ResendButton, SentAddressCard, useCooldown } from "@/components/auth/email-sent";
import { SIGNED_IN_COOKIE } from "@/lib/session-hint";
import { afterVerificationHref, forgetContinuation, rememberContinuation } from "@/lib/pending-signup";

function noopSubscribe() {
  return () => {};
}

function hasSessionHint(): boolean {
  return document.cookie.split("; ").some((c) => c === `${SIGNED_IN_COOKIE}=1`);
}

type ResendState = "idle" | "sending" | "sent" | "limited" | "failed";

export default function CheckEmailPage() {
  // Prerendered: the query string only exists client-side.
  const search = React.useSyncExternalStore(noopSubscribe, () => window.location.search, () => "");
  const params = React.useMemo(() => new URLSearchParams(search), [search]);
  const email = params.get("email") ?? "";
  const fromSignIn = params.get("reason") === "signin";
  const carried = new URLSearchParams();
  for (const key of ["next", "mcp_authorize"]) {
    const value = params.get(key);
    if (value) carried.set(key, value);
  }
  const carriedQuery = carried.size ? `?${carried}` : "";

  const [resend, setResend] = React.useState<ResendState>("idle");
  const cooldown = useCooldown(fromSignIn ? 0 : RESEND_COOLDOWN_S);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    if (search) rememberContinuation(params);
  }, [search, params]);

  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // The link opened in another tab of this browser signs it in; carry on here when the user comes back.
  React.useEffect(() => {
    function continueIfSignedIn() {
      if (document.visibilityState !== "visible" || !hasSessionHint()) return;
      const href = afterVerificationHref();
      forgetContinuation();
      window.location.assign(href);
    }
    document.addEventListener("visibilitychange", continueIfSignedIn);
    window.addEventListener("focus", continueIfSignedIn);
    return () => {
      document.removeEventListener("visibilitychange", continueIfSignedIn);
      window.removeEventListener("focus", continueIfSignedIn);
    };
  }, []);

  async function resendLink() {
    setResend("sending");
    const res = await fetch("/api/auth/verification/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    if (res?.status === 429) return setResend("limited");
    if (!res?.ok) return setResend("failed");
    setResend("sent");
    cooldown.restart();
  }

  return (
    <div className="text-center">
      <AuthMailScene className="mb-6" />
      <AuthHeading
        align="center"
        compact
        headingRef={headingRef}
        title="Check your"
        accent="email"
        subtitle={fromSignIn ? "Verify your email to sign in. We sent a link to:" : "We sent a verification link to:"}
      />

      <SentAddressCard
        email={email}
        meta="Expires in 24 hours · works once"
        action={
          <Link href={`/register${carriedQuery}`} className={AUTH_LINK}>
            Change
          </Link>
        }
      />

      <div className="mt-8 flex flex-col gap-3">
        <InboxButton email={email} />
        <ResendButton
          email={email}
          label="Resend email"
          sending={resend === "sending"}
          cooldown={cooldown.seconds}
          onResend={resendLink}
        />
      </div>

      <p role="status" className="mt-3 min-h-5 text-sm">
        {resend === "sent" && <span className="text-success">We sent a new link. It replaces the old one.</span>}
        {resend === "limited" && <span className="text-destructive">Too many attempts. Try again in a few minutes.</span>}
        {resend === "failed" && <span className="text-destructive">Couldn&apos;t send it. Try again.</span>}
      </p>

      <p className="mx-auto mt-4 max-w-[400px] text-[13px] leading-relaxed text-muted-foreground">
        Open the link in this browser to go straight to your dashboard. Can&apos;t find the email? Check your spam
        folder.
      </p>

      <AuthSwitch className="mt-7">
        Already verified?{" "}
        <Link href={`/login${carriedQuery}${carriedQuery ? "&" : "?"}email=${encodeURIComponent(email)}`} className={AUTH_LINK}>
          Sign in
        </Link>
      </AuthSwitch>
    </div>
  );
}
