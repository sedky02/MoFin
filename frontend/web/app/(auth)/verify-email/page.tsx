"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <div>
        <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight">
          This link can&apos;t be used
        </h1>
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>It may have expired or already been used. Request a new one.</span>
        </div>
        <Button asChild variant="outline" className="mt-6">
          <Link href={next}>Back to MoFin</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight">
        Your email is verified
      </h1>
      <Button asChild className="mt-6">
        <Link href={next}>{next === "/dashboard" ? "Go to MoFin" : "Back to your invitation"}</Link>
      </Button>
    </div>
  );
}
