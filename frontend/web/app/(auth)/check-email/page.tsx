"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Mail, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTH_BUTTON, AUTH_LINK, AuthHeading, AuthSwitch } from "@/components/auth/auth-parts";
import { AuthMailScene } from "@/components/auth/auth-scenes";
import { mailProviderFor } from "@/lib/mail-providers";
import { SIGNED_IN_COOKIE } from "@/lib/session-hint";
import { cn } from "@/lib/utils";
import { afterVerificationHref, forgetContinuation, rememberContinuation } from "@/lib/pending-signup";

const RESEND_COOLDOWN_S = 60;

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
  const [cooldown, setCooldown] = React.useState(fromSignIn ? 0 : RESEND_COOLDOWN_S);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    if (search) rememberContinuation(params);
  }, [search, params]);

  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

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
    setCooldown(RESEND_COOLDOWN_S);
  }

  const resendLabel =
    resend === "sending" ? "Sending…" : cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend email";
  const provider = mailProviderFor(email);

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

      <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3.5 text-left">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/20">
          <Mail className="size-[18px] text-primary-text" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-foreground">{email || "your address"}</span>
          <span className="mt-0.5 block text-[13px] text-muted-foreground">Expires in 24 hours · works once</span>
        </span>
        <Link href={`/register${carriedQuery}`} className={cn(AUTH_LINK, "shrink-0 text-sm")}>
          Change
        </Link>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {provider && (
          <Button asChild className={AUTH_BUTTON}>
            <a href={provider.inboxUrl} target="_blank" rel="noopener noreferrer">
              Open {provider.name}
              <ExternalLink className="size-4" aria-hidden />
            </a>
          </Button>
        )}
        <Button
          type="button"
          variant={provider ? "outline" : "default"}
          className={AUTH_BUTTON}
          disabled={!email || cooldown > 0 || resend === "sending"}
          onClick={resendLink}
        >
          <RotateCw className="size-4" aria-hidden />
          {resendLabel}
        </Button>
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
