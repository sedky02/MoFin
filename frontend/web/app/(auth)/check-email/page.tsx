"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Clock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTH_BUTTON, AUTH_LINK, AuthChip, AuthChips, AuthHeading, AuthSwitch } from "@/components/auth/auth-parts";
import { AuthMailScene } from "@/components/auth/auth-scenes";
import { SIGNED_IN_COOKIE } from "@/lib/session-hint";
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

  return (
    <div className="text-center">
      <AuthMailScene className="mb-7" />
      <AuthHeading
        align="center"
        headingRef={headingRef}
        title="Check your"
        accent="email"
        subtitle={
          <>
            {fromSignIn ? "Verify your email to sign in. " : ""}
            We sent an email to <span className="font-semibold text-foreground">{email || "your address"}</span>. Open
            the link in it to finish setting up your account.
          </>
        }
      />
      <AuthChips>
        <AuthChip icon={Clock}>Expires in 24 hours</AuthChip>
        <AuthChip icon={Check}>Works once</AuthChip>
      </AuthChips>
      <p className="mt-8 text-[15px] leading-relaxed text-muted-foreground">
        Open it in this browser to go straight to your dashboard. Nothing arrived? Check your spam folder.
      </p>

      <p role="status" className="mt-4 min-h-5 text-sm">
        {resend === "sent" && <span className="text-success">We sent a new link.</span>}
        {resend === "limited" && <span className="text-destructive">Too many attempts. Try again in a few minutes.</span>}
        {resend === "failed" && <span className="text-destructive">Couldn&apos;t send it. Try again.</span>}
      </p>

      <div className="mt-6 flex flex-col gap-3.5">
        <Button
          type="button"
          variant={fromSignIn ? "default" : "outline"}
          className={AUTH_BUTTON}
          disabled={!email || cooldown > 0 || resend === "sending"}
          onClick={resendLink}
        >
          <RotateCw className="size-[18px]" aria-hidden />
          {resendLabel}
        </Button>
        <Button asChild variant="ghost" className="h-11 w-full text-[15px] font-semibold text-muted-foreground">
          <Link href={`/register${carriedQuery}`}>
            Use a different email
          </Link>
        </Button>
      </div>

      <AuthSwitch className="mt-6">
        Already verified?{" "}
        <Link href={`/login${carriedQuery}${carriedQuery ? "&" : "?"}email=${encodeURIComponent(email)}`} className={AUTH_LINK}>
          Sign in
        </Link>
      </AuthSwitch>
    </div>
  );
}
