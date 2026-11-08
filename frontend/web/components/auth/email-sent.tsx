"use client";

import * as React from "react";
import { ExternalLink, Mail, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTH_BUTTON } from "@/components/auth/auth-parts";
import { mailProviderFor } from "@/lib/mail-providers";

export const RESEND_COOLDOWN_S = 60;

/** The address a link went to, what the link allows, and a way to change it. */
export function SentAddressCard({ email, meta, action }: { email: string; meta: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3.5 text-left">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/20">
        <Mail className="size-[18px] text-primary-text" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-foreground">{email || "your address"}</span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">{meta}</span>
      </span>
      <span className="shrink-0 text-sm">{action}</span>
    </div>
  );
}

/** Opens the webmail inbox for common providers; nothing for other addresses. */
export function InboxButton({ email }: { email: string }) {
  const provider = mailProviderFor(email);
  if (!provider) return null;
  return (
    <Button asChild className={AUTH_BUTTON}>
      <a href={provider.inboxUrl} target="_blank" rel="noopener noreferrer">
        Open {provider.name}
        <ExternalLink className="size-4" aria-hidden />
      </a>
    </Button>
  );
}

export function useCooldown(initialSeconds: number) {
  const [seconds, setSeconds] = React.useState(initialSeconds);
  React.useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  return { seconds, restart: () => setSeconds(RESEND_COOLDOWN_S) };
}

/** Primary when there's no inbox shortcut to lead with. */
export function ResendButton({
  email,
  label,
  sending,
  cooldown,
  onResend,
}: {
  email: string;
  label: string;
  sending: boolean;
  cooldown: number;
  onResend: () => void;
}) {
  const leading = mailProviderFor(email) !== null;
  return (
    <Button
      type="button"
      variant={leading ? "outline" : "default"}
      className={AUTH_BUTTON}
      disabled={!email || cooldown > 0 || sending}
      onClick={onResend}
    >
      <RotateCw className="size-4" aria-hidden />
      {sending ? "Sending…" : cooldown > 0 ? `${label} in ${cooldown}s` : label}
    </Button>
  );
}
