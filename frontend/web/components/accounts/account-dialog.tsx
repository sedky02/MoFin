"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/common/submit-button";
import { ACCOUNT_TYPES, CURRENCIES } from "@/lib/constants";
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
} from "@/hooks/useAccounts";
import type { Account } from "@/lib/types";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(60),
  type: z.enum(["CASH", "BANK", "SAVINGS", "CRYPTO"]),
  currency: z.string().trim().min(2, "Select a currency.").max(10),
});
type Values = z.infer<typeof schema>;

export function AccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: Account; // present → edit mode
}) {
  const isEdit = !!account;
  const createMut = useCreateAccount();
  const updateMut = useUpdateAccount();
  const { data: accounts } = useAccounts();

  // Currencies already in use across the user's accounts, surfaced as a
  // quick-pick section at the top of the picker. Ordered by frequency.
  const usedCurrencies = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of accounts ?? []) {
      if (a.currency) counts.set(a.currency, (counts.get(a.currency) ?? 0) + 1);
    }
    return Array.from(counts.keys()).sort(
      (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0),
    );
  }, [accounts]);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: account?.name ?? "",
      type: account?.type ?? "BANK",
      currency: account?.currency ?? "USD",
    },
  });

  // Reset whenever we open with a (possibly different) account.
  React.useEffect(() => {
    if (open) {
      form.reset({
        name: account?.name ?? "",
        type: account?.type ?? "BANK",
        currency: account?.currency ?? "USD",
      });
    }
  }, [open, account, form]);

  async function action() {
    const valid = await form.trigger();
    if (!valid) return;
    const values = form.getValues();
    try {
      if (isEdit) {
        await updateMut.mutateAsync({
          id: account.id,
          name: values.name,
          type: values.type,
        });
      } else {
        await createMut.mutateAsync(values);
      }
      onOpenChange(false);
    } catch {
      // handled by hook's onError toast / setError not needed here
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit account" : "New account"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this account's name or type."
              : "Add an account to track its balance via the ledger."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form action={action} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Everyday checking" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isEdit} // currency is fixed after creation
                  >
                    <FormControl>
                      <SelectTrigger className="w-full tabular">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {usedCurrencies.length > 0 && (
                        <>
                          <SelectGroup>
                            <SelectLabel>In use</SelectLabel>
                            {usedCurrencies.map((c) => (
                              <SelectItem
                                key={`used-${c}`}
                                value={c}
                                className="tabular"
                              >
                                {c}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                          <SelectSeparator />
                        </>
                      )}
                      <SelectGroup>
                        <SelectLabel>All currencies</SelectLabel>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c} className="tabular">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <SubmitButton pendingText="Saving…">
                {isEdit ? "Save changes" : "Create account"}
              </SubmitButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
