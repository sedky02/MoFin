"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PENDING_INVITE_KEY, ROLE_LABEL } from "@/lib/account-sharing";
import { loginUrlWithNext } from "@/lib/safe-next";
import type { InvitationPreview, User } from "@/lib/types";

const HERE = "/invitations/accept";

type Problem = { code?: string; message?: string };

async function post(path: string, body?: object) {
  return fetch(`/api/backend${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** The token from the link, kept while the person signs in, signs up or verifies their email. */
function takeToken(): string | null {
  const fromLink = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
  try {
    if (fromLink) {
      localStorage.setItem(PENDING_INVITE_KEY, fromLink);
      // Out of the address bar and the back stack.
      window.history.replaceState(null, "", window.location.pathname);
      return fromLink;
    }
    return localStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return fromLink;
  }
}

function forgetToken() {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Nothing kept, nothing to forget.
  }
}

/** The card every state sits on. The inner panel's radius is the card's minus its padding. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-hero bg-card p-3.5 shadow-hero">
      <h1 className="px-3 pt-4 pb-5 text-center text-xl font-semibold tracking-tight text-balance">
        {title}
      </h1>
      {children}
    </div>
  );
}

/** Same panel as the invitation email, so the two read as one step. */
function AccountPanel({ preview }: { preview: InvitationPreview }) {
  return (
    <div className="rounded-xl bg-brand-ink p-5 text-white dark:ring-1 dark:ring-white/10">
      <p className="text-xs text-white/60">Shared account</p>
      <p className="mt-1 truncate text-2xl font-semibold tracking-tight">{preview.accountName}</p>
      <p className="mt-3.5 flex items-center gap-2 text-xs">
        <span className="rounded-full bg-brand-lime px-2.5 py-1 font-semibold text-brand-ink">
          {ROLE_LABEL[preview.role]}
        </span>
        <span className="tabular text-white/60">{preview.currency}</span>
      </p>
    </div>
  );
}

const ACTION = "h-12 w-full rounded-xl text-base";

function Note({ children, alert }: { children: React.ReactNode; alert?: boolean }) {
  return (
    <p
      role={alert ? "alert" : undefined}
      className={`px-2 pt-3.5 text-center text-sm ${alert ? "text-destructive" : "text-muted-foreground"}`}
    >
      {children}
    </p>
  );
}

export default function AcceptInvitationPage() {
  const router = useRouter();
  const [token, setToken] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<InvitationPreview | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "invalid" | "declined">("loading");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [needsVerifying, setNeedsVerifying] = React.useState(false);
  const [verificationSent, setVerificationSent] = React.useState(false);

  React.useEffect(() => {
    const stored = takeToken();
    (async () => {
      if (!stored) return setStatus("invalid");
      setToken(stored);
      const [previewRes, userRes] = await Promise.all([
        post("/invitations/preview", { token: stored }),
        fetch("/api/backend/users/me"),
      ]);
      if (!previewRes.ok) {
        forgetToken();
        return setStatus("invalid");
      }
      setPreview((await previewRes.json()) as InvitationPreview);
      if (userRes.ok) setUser((await userRes.json()) as User);
      setStatus("ready");
    })().catch(() => setStatus("invalid"));
  }, []);

  async function accept() {
    if (!token) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await post("/invitations/accept", { token });
      if (res.ok) {
        forgetToken();
        toast.success(`You joined ${preview?.accountName}.`);
        router.replace("/accounts");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as Problem;
      if (body.code === "EMAIL_NOT_VERIFIED") setNeedsVerifying(true);
      else if (res.status === 400) setStatus("invalid");
      else setProblem(body.message ?? "Could not accept the invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (!token) return;
    setBusy(true);
    await post("/invitations/decline", { token }).finally(() => setBusy(false));
    forgetToken();
    setStatus("declined");
  }

  async function sendVerification() {
    setBusy(true);
    setProblem(null);
    const res = await post("/auth/email/verification").finally(() => setBusy(false));
    if (res.ok) setVerificationSent(true);
    else setProblem("Could not send the email. Try again in a few minutes.");
  }

  async function switchAccount() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign(loginUrlWithNext(HERE));
  }

  if (status === "loading") return <div aria-busy="true" className="min-h-80" />;

  if (status === "declined") {
    return (
      <Card title="Invitation declined">
        <Button asChild variant="outline" className={ACTION}>
          <Link href="/dashboard">Go to MoFin</Link>
        </Button>
      </Card>
    );
  }

  if (status === "invalid" || !preview) {
    return (
      <Card title="Invitation unavailable">
        <p className="-mt-3 pb-5 text-center text-sm text-muted-foreground">Ask for a new one.</p>
        <Button asChild variant="outline" className={ACTION}>
          <Link href="/dashboard">Go to MoFin</Link>
        </Button>
      </Card>
    );
  }

  const wrongPerson = !!user && user.email !== preview.email;

  return (
    <>
      <Card title={`${preview.invitedBy} invited you`}>
        <AccountPanel preview={preview} />
        <div className="mt-3.5 space-y-2">
          {wrongPerson ? (
            <Button className={ACTION} onClick={switchAccount}>
              Switch account
            </Button>
          ) : !user ? (
            <>
              <Button asChild className={ACTION}>
                <Link href={loginUrlWithNext(HERE)}>Sign in to accept</Link>
              </Button>
              <Button asChild variant="outline" className={ACTION}>
                <Link href={`/register?next=${encodeURIComponent(HERE)}`}>Create an account</Link>
              </Button>
            </>
          ) : needsVerifying ? (
            !verificationSent && (
              <Button className={ACTION} onClick={sendVerification} disabled={busy}>
                Verify your email
              </Button>
            )
          ) : (
            <Button className={ACTION} onClick={accept} disabled={busy}>
              Accept
            </Button>
          )}
          {!wrongPerson && !needsVerifying && (
            <Button variant="ghost" className={ACTION} onClick={decline} disabled={busy}>
              Decline
            </Button>
          )}
        </div>
        {problem && <Note alert>{problem}</Note>}
        {wrongPerson && <Note alert>This invitation is for {preview.email}.</Note>}
        {!user && <Note>Sent to {preview.email}</Note>}
        {verificationSent && <Note>Check your inbox.</Note>}
      </Card>
      {token && (
        // Touch screens only: that's where the app is.
        <p className="mt-5 hidden text-center pointer-coarse:block">
          <a
            href={`mofin://invitations?token=${encodeURIComponent(token)}`}
            className="text-sm text-muted-foreground underline underline-offset-2"
          >
            Open in the app
          </a>
        </p>
      )}
    </>
  );
}
