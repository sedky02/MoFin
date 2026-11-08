"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTH_BUTTON, AuthHeading } from "@/components/auth/auth-parts";
import { AuthBrokenLinkScene, AuthSuccessScene } from "@/components/auth/auth-scenes";
import { PENDING_INVITE_KEY } from "@/lib/account-sharing";

function hasPendingInvite(): boolean {
  try {
    return !!localStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return false;
  }
}

export default function VerifyEmailPage() {
  const [status, setStatus] = React.useState<"loading" | "done" | "invalid">("loading");
  const [next, setNext] = React.useState("/dashboard");

  React.useEffect(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
    // Out of the address bar and the back stack.
    window.history.replaceState(null, "", window.location.pathname);
    (async () => {
      const verified = token
        ? await fetch("/api/backend/auth/email/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          }).then(
            (res) => res.ok,
            () => false,
          )
        : false;
      if (hasPendingInvite()) setNext("/invitations/accept");
      setStatus(verified ? "done" : "invalid");
    })();
  }, []);

  if (status === "loading") return <div aria-busy="true" className="min-h-64" />;

  if (status === "invalid") {
    return (
      <div className="text-center">
        <AuthBrokenLinkScene className="mb-7" />
        <AuthHeading align="center" title="This link can't be" accent="used" />
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-left text-sm leading-relaxed text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>It may have expired or already been used. Request a new one.</span>
        </div>
        <Button asChild variant="outline" className={`${AUTH_BUTTON} mt-11`}>
          <Link href={next}>Back to MoFin</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <AuthSuccessScene className="mb-7" />
      <AuthHeading
        align="center"
        title="Your email is"
        accent="verified"
        subtitle="Thanks for confirming it. You can carry on where you were."
      />
      <Button asChild className={`${AUTH_BUTTON} mt-2`}>
        <Link href={next}>
          {next === "/dashboard" ? "Go to MoFin" : "Back to your invitation"}
          <ArrowRight className="size-[18px]" aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
