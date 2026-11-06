"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PENDING_INVITE_KEY, ROLE_HELP, ROLE_LABEL } from "@/lib/account-sharing";
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

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight">{children}</h1>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="mt-4 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
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

  if (status === "loading") return <div aria-busy="true" className="min-h-64" />;

  if (status === "declined") {
    return (
      <div>
        <Heading>Invitation declined</Heading>
        <p className="mt-3 text-sm text-muted-foreground">
          You won&apos;t be added to this account.
        </p>
      </div>
    );
  }

  if (status === "invalid" || !preview) {
    return (
      <div>
        <Heading>This invitation can&apos;t be used</Heading>
        <Alert>It may have expired, been revoked or already been answered. Ask for a new one.</Alert>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/dashboard">Go to MoFin</Link>
        </Button>
      </div>
    );
  }

  const wrongPerson = !!user && user.email !== preview.email;
  const role = ROLE_LABEL[preview.role].toLowerCase();

  return (
    <div>
      <Heading>{preview.invitedBy} invited you to an account</Heading>
      <p className="mt-3 text-sm text-muted-foreground">
        Join <span className="font-medium text-foreground">{preview.accountName}</span> ({preview.currency})
        as {role === "editor" ? "an" : "a"} {role}. {ROLE_HELP[preview.role]}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        You&apos;ll see its full history, and the owner and other members will see what you add.
      </p>

      {problem && <Alert>{problem}</Alert>}

      {wrongPerson ? (
        <>
          <Alert>
            This invitation is for {preview.email}, and you&apos;re signed in as {user.email}.
          </Alert>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={switchAccount}>Switch account</Button>
          </div>
        </>
      ) : !user ? (
        <>
          <p className="mt-4 text-sm">
            Sign in with <span className="font-medium">{preview.email}</span> to accept, or create an
            account with that address.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild>
              <Link href={loginUrlWithNext(HERE)}>Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/register?next=${encodeURIComponent(HERE)}`}>Create an account</Link>
            </Button>
            <Button variant="ghost" onClick={decline} disabled={busy}>
              Decline
            </Button>
          </div>
        </>
      ) : needsVerifying ? (
        <div className="mt-6 space-y-3">
          <p className="text-sm">
            Verify {preview.email} first. We&apos;ll email you a link, and you can come back here
            afterwards.
          </p>
          {verificationSent ? (
            <p className="flex items-center gap-2 text-sm font-medium">
              <MailCheck className="size-4" aria-hidden />
              Check your inbox, then open the link.
            </p>
          ) : (
            <Button onClick={sendVerification} disabled={busy}>
              Send verification email
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={accept} disabled={busy}>
            Accept invitation
          </Button>
          <Button variant="outline" onClick={decline} disabled={busy}>
            Decline
          </Button>
        </div>
      )}

      {token && (
        // Touch screens only: that's where the app is.
        <a
          href={`mofin://invitations?token=${encodeURIComponent(token)}`}
          className="mt-6 hidden text-sm underline underline-offset-2 pointer-coarse:inline-block"
        >
          Open in the MoFin app
        </a>
      )}
    </div>
  );
}
