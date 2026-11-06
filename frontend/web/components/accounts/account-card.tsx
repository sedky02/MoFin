"use client";

import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Bitcoin,
  Banknote,
  Eye,
  EyeOff,
  Landmark,
  PiggyBank,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { isAmountHidden } from "@/lib/account-privacy";
import type { Account, AccountType } from "@/lib/types";
import { useLedgerBalance } from "@/hooks/useLedger";
import { HideableAmount } from "@/components/common/hideable-amount";
import { MoneyAmount } from "@/components/common/money-amount";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { tryParse } from "@/lib/decimal";
import { cn } from "@/lib/utils";

export const TYPE_ICON: Record<AccountType, LucideIcon> = {
  CASH: Banknote,
  BANK: Landmark,
  SAVINGS: PiggyBank,
  CRYPTO: Bitcoin,
};

/** One account as its own card: type tile, name and currency, balance, and quiet actions. */
export function AccountRow({
  account,
  onEdit,
  onToggleHidden,
  onArchive,
  onRestore,
  busy = false,
}: {
  account: Account;
  onEdit?: (account: Account) => void;
  /** Hides or shows this account's balance everywhere (saved on the account). */
  onToggleHidden?: (account: Account) => void;
  onArchive?: (account: Account) => void;
  onRestore?: (account: Account) => void;
  busy?: boolean;
}) {
  // Parallel per-account balance query (key = currency when accountId is passed).
  // Archived accounts are readable too, so a failed request is a real error and is
  // shown as one, never as a balance of 0. An empty result is an account with no
  // ledger entries yet, which really is 0.
  const { data, isLoading, isError, refetch } = useLedgerBalance({
    accountId: account.id,
  });
  const balance =
    data?.find((b) => b.key === account.currency)?.balance ??
    data?.[0]?.balance ??
    "0";
  const Icon = TYPE_ICON[account.type];
  // Quiet until you point at the row or move focus into it; on touch screens there is no
  // hover, so the actions stay visible there.
  const reveal =
    "transition-opacity sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100 pointer-coarse:opacity-100";

  const isZero = tryParse(balance)?.isZero() ?? false;
  const hidden = isAmountHidden(account);

  return (
    <li aria-busy={busy || undefined} className="min-w-0">
      <Card
        className={cn(
          "group/row gap-4 border-0 p-5 shadow-sm transition-opacity",
          busy && "opacity-60",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground"
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium">{account.name}</h3>
            <p className="text-xs text-muted-foreground tabular">
              {account.currency}
            </p>
          </div>
          {onRestore ? (
            <Button
              variant="ghost"
              size="sm"
              className="-mr-1 gap-1.5 text-muted-foreground"
              disabled={busy}
              onClick={() => onRestore(account)}
              aria-label={`Restore ${account.name}`}
            >
              <ArchiveRestore className="size-4" />
              Restore
            </Button>
          ) : (
            <div className={cn("-mr-1 flex shrink-0 items-center", reveal)}>
              {onToggleHidden && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  disabled={busy}
                  onClick={() => onToggleHidden(account)}
                  aria-label={hidden ? `Show the balance of ${account.name}` : `Hide the balance of ${account.name}`}
                  aria-pressed={hidden}
                  title={hidden ? "Show balance" : "Hide balance"}
                >
                  {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              )}
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  onClick={() => onEdit(account)}
                  aria-label={`Edit ${account.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
              )}
              {onArchive && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onArchive(account)}
                  aria-label={`Archive ${account.name}`}
                  title="Archive"
                >
                  <Archive className="size-4" />
                </Button>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <Skeleton className="h-8 w-36" />
        ) : isError ? (
          <div
            role="alert"
            className="flex min-h-8 flex-wrap items-center gap-x-1 text-sm text-destructive"
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span>Couldn&apos;t load balance</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-foreground"
              onClick={() => refetch()}
              aria-label={`Retry loading the balance of ${account.name}`}
            >
              Retry
            </Button>
          </div>
        ) : (
          <HideableAmount
            account={account}
            currency={account.currency}
            // The eye beside Edit saves the choice; no second, temporary one here.
            toggle={false}
            className="block text-2xl font-semibold leading-8"
          >
            <MoneyAmount
              amount={balance}
              currency={account.currency}
              // Zero is neither good nor bad: plain text, not green.
              colorBySign={!isZero}
              className="block text-2xl font-semibold leading-8"
            />
          </HideableAmount>
        )}
      </Card>
    </li>
  );
}
