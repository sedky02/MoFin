"use client";

import * as React from "react";
import { useUser } from "@/hooks/useUser";
import { timeLeft } from "@/lib/demo";

/**
 * Shown to temporary demo users: what this is, how long it lasts, and the way
 * to a real account. Signing up first signs the demo out, since /register is
 * closed to signed-in visitors.
 */
export function DemoBanner() {
  const { data: user } = useUser();
  const [leaving, setLeaving] = React.useState(false);
  if (!user?.isDemo) return null;

  const left = user.expiresAt ? timeLeft(user.expiresAt) : null;

  async function createAccount() {
    setLeaving(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/register");
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-accent px-4 py-2 text-center text-sm text-accent-foreground"
    >
      <span>
        You&apos;re trying MoFin with sample data.
        {left ? ` This demo is deleted in ${left}.` : " This demo has ended."}
      </span>
      <button
        type="button"
        onClick={createAccount}
        disabled={leaving}
        className="font-semibold underline underline-offset-4 hover:no-underline disabled:opacity-60"
      >
        {leaving ? "One moment…" : "Create your own account"}
      </button>
    </div>
  );
}
