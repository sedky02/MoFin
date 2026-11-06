import { useAccounts } from "@/hooks/useAccounts";
import { useUpdateUser, useUser } from "@/hooks/useUser";
import type { Account } from "@/core/types";

/**
 * Stored in `user.settings.mainAccountId` so it follows the user across devices; resolved against
 * the live list so an archived or deleted account stops being main.
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
