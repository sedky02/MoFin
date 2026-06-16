"use client";

import { MoreVertical, Pencil, Archive } from "lucide-react";
import type { Account } from "@/lib/types";
import { useLedgerBalance } from "@/hooks/useLedger";
import { MoneyAmount } from "@/components/common/money-amount";
import { AccountTypeBadge } from "@/components/common/badges";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AccountCard({
  account,
  onEdit,
  onArchive,
}: {
  account: Account;
  onEdit: (account: Account) => void;
  onArchive: (account: Account) => void;
}) {
  // Parallel per-account balance query (key = currency when accountId is passed).
  const { data, isLoading } = useLedgerBalance({ accountId: account.id });
  const balance =
    data?.find((b) => b.key === account.currency)?.balance ?? data?.[0]?.balance ?? "0";

  return (
    <Card className="group relative border-0 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{account.name}</h3>
          <div className="mt-1.5 flex items-center gap-2">
            <AccountTypeBadge type={account.type} />
            <span className="text-xs text-muted-foreground tabular">
              {account.currency}
            </span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label={`Actions for ${account.name}`}
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(account)}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onArchive(account)}>
              <Archive className="size-4" />
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-5">
        <p className="text-xs text-muted-foreground">Current balance</p>
        {isLoading ? (
          <Skeleton className="mt-1.5 h-7 w-28" />
        ) : (
          <MoneyAmount
            amount={balance}
            currency={account.currency}
            colorBySign
            className="mt-1 block text-2xl font-semibold"
          />
        )}
      </div>
    </Card>
  );
}
