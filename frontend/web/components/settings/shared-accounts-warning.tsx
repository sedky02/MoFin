"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useOwnedSharedAccounts } from "@/hooks/useAccountSharing";
import { memberName } from "@/lib/account-sharing";

/**
 * Says who loses access when you delete what you own, and the way out: pass each account on first,
 * from its People screen.
 */
export function SharedAccountsWarning({ enabled }: { enabled: boolean }) {
  const { data: accounts = [] } = useOwnedSharedAccounts(enabled);
  if (accounts.length === 0) return null;
  return (
    <div
      role="alert"
      className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm"
    >
      <p className="flex items-center gap-2 font-medium text-destructive">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        Other people use accounts you own
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {accounts.map((account) => (
          <li key={account.id}>
            <span className="font-medium">{account.name}</span>:{" "}
            {account.members.map(memberName).join(", ")}
          </li>
        ))}
      </ul>
      <p>
        These accounts will be deleted for them too. To keep them going,{" "}
        <Link href="/accounts" className="underline underline-offset-2">
          pass ownership to someone on each account
        </Link>{" "}
        first.
      </p>
    </div>
  );
}
