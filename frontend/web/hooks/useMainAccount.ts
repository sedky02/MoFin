"use client";

import { useAccounts } from "@/hooks/useAccounts";
import { useUpdateUser, useUser } from "@/hooks/useUser";
import type { Account } from "@/lib/types";

/**
 * The user's preferred account, stored in `user.settings.mainAccountId` so it
 * follows them across devices. Resolved against the live account list, so an
 * archived or deleted account silently stops being "main" instead of scoping
 * the dashboard to something that no longer exists.
 */
export function useMainAccount(): {
  account: Account | undefined;
  accountId: string | undefined;
  setMainAccountId: (id?: string) => Promise<unknown>;
  isPending: boolean;
} {
  const { data: user } = useUser();
  const { data: accounts } = useAccounts();
  const update = useUpdateUser();
  const account = accounts?.find((a) => a.id === user?.settings?.mainAccountId);

  return {
    account,
    accountId: account?.id,
    isPending: update.isPending,
    setMainAccountId: (id) => {
      // The API replaces `settings` wholesale, so merge into the existing object.
      const { mainAccountId: _old, ...rest } = user?.settings ?? {};
      void _old;
      return update.mutateAsync({ settings: { ...rest, ...(id ? { mainAccountId: id } : {}) } });
    },
  };
}
