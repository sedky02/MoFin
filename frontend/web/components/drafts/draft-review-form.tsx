"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/common/money-input";
import { TypeSwitcher } from "@/components/transactions/type-switcher";
import { AccountSelect } from "@/components/transactions/account-select";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { makeTransactionSchema, type TransactionFormValues } from "@/lib/transaction-schema";
import { parseMoneyInput, formatMoneyInput, toDatetimeLocal } from "@/lib/format";
import type { DraftTransaction, ParsedTransactionData } from "@/lib/types";
import { Loader2 } from "lucide-react";

export function DraftReviewForm({
  draft,
  approving,
  onApprove,
  onCancel,
}: {
  draft: DraftTransaction;
  approving: boolean;
  onApprove: (edits: Partial<ParsedTransactionData>) => void;
  onCancel: () => void;
}) {
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const accountList = accounts ?? [];
  const schema = makeTransactionSchema(accountList);

  const p = draft.parsedData;
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: p.type ?? "EXPENSE",
      description: p.description ?? draft.rawInput,
      amountRaw: p.amount ? formatMoneyInput(p.amount) : "",
      currency: p.currency ?? "",
      fromAccountId: p.fromAccountId ?? undefined,
      toAccountId: p.toAccountId ?? undefined,
      categoryId: p.categoryId ?? undefined,
      occurredAt: toDatetimeLocal(p.occurredAt),
    },
  });

  const type = form.watch("type");
  const fromAccountId = form.watch("fromAccountId");
  const toAccountId = form.watch("toAccountId");
  const currency = form.watch("currency");

  const sourceAccountId = type === "INCOME" ? toAccountId : fromAccountId;
  React.useEffect(() => {
    const acct = accountList.find((a) => a.id === sourceAccountId);
    if (acct && acct.currency !== currency) {
      form.setValue("currency", acct.currency, { shouldValidate: false });
    }
  }, [sourceAccountId, accountList, currency, form]);

  const relevantCategories = (categories ?? []).filter((c) =>
    type === "TRANSFER" ? false : c.type === type,
  );

  async function action() {
    const valid = await form.trigger();
    if (!valid) return;
    const v = form.getValues();
    const amount = parseMoneyInput(v.amountRaw);
    if (!amount) return;
    onApprove({
      type: v.type,
      description: v.description,
      amount,
      currency: v.currency,
      occurredAt: new Date(v.occurredAt).toISOString(),
      fromAccountId: v.type !== "INCOME" ? v.fromAccountId : undefined,
      toAccountId: v.type !== "EXPENSE" ? v.toAccountId : undefined,
      categoryId: v.type !== "TRANSFER" ? v.categoryId : undefined,
    });
  }

  return (
    <Form {...form}>
      <form action={action} className="space-y-4 border-t border-border pt-4">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <TypeSwitcher
                value={field.value}
                onChange={(t) => {
                  field.onChange(t);
                  if (t === "TRANSFER") form.setValue("categoryId", undefined);
                }}
              />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="amountRaw"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <MoneyInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    currency={currency || undefined}
                    aria-invalid={!!form.formState.errors.amountRaw}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="occurredAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="datetime-local" className="tabular" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {type !== "INCOME" && (
            <FormField
              control={form.control}
              name="fromAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{type === "TRANSFER" ? "From" : "Account"}</FormLabel>
                  <FormControl>
                    <AccountSelect
                      accounts={accountList}
                      value={field.value}
                      onChange={field.onChange}
                      aria-invalid={!!form.formState.errors.fromAccountId}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {type !== "EXPENSE" && (
            <FormField
              control={form.control}
              name="toAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{type === "TRANSFER" ? "To" : "Account"}</FormLabel>
                  <FormControl>
                    <AccountSelect
                      accounts={accountList}
                      value={field.value}
                      onChange={field.onChange}
                      aria-invalid={!!form.formState.errors.toAccountId}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        {type !== "TRANSFER" && (
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Category <span className="font-normal text-muted-foreground">(optional)</span>
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Uncategorized" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {relevantCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          {c.icon && <span>{c.icon}</span>}
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={approving} className="gap-2">
            {approving && <Loader2 className="size-4 animate-spin" />}
            Approve &amp; record
          </Button>
        </div>
      </form>
    </Form>
  );
}
