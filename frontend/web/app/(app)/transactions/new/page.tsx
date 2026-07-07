"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Wallet } from "lucide-react";
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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/page-header";
import { SubmitButton } from "@/components/common/submit-button";
import { MoneyInput } from "@/components/common/money-input";
import { EmptyState } from "@/components/common/states";
import { TypeSwitcher } from "@/components/transactions/type-switcher";
import { AccountSelect } from "@/components/transactions/account-select";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useCreateTransaction } from "@/hooks/useTransactions";
import {
  makeTransactionSchema,
  type TransactionFormValues,
} from "@/lib/transaction-schema";
import { parseMoneyInput, toDatetimeLocal } from "@/lib/format";
import { handleApiError } from "@/lib/form-errors";

export default function NewTransactionPage() {
  const router = useRouter();
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: categories } = useCategories();
  const createMut = useCreateTransaction();

  const accountList = accounts ?? [];
  const schema = makeTransactionSchema(accountList);

  const noAccounts = !accountsLoading && accountList.length === 0;
  const [accountDialogOpen, setAccountDialogOpen] = React.useState(false);


  

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "EXPENSE",
      description: "",
      amountRaw: "",
      currency: "",
      fromAccountId: undefined,
      toAccountId: undefined,
      categoryId: undefined,
      occurredAt: "",
    },
  });

  // `new Date()` must not run during the initial (possibly prerendered) render,
  // so the "now" default is filled in after mount instead of in defaultValues.
  React.useEffect(() => {
    if (!form.getValues("occurredAt")) {
      form.setValue("occurredAt", toDatetimeLocal());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const type = form.watch("type");
  const fromAccountId = form.watch("fromAccountId");
  const toAccountId = form.watch("toAccountId");
  const currency = form.watch("currency");

  // Pre-select a default account once accounts load (only if not already set).
  React.useEffect(() => {
    if (accountList.length === 0) return;
    if (!form.getValues("fromAccountId")) {
      form.setValue("fromAccountId", accountList[0].id);
    }
    if (!form.getValues("toAccountId")) {
      form.setValue("toAccountId", (accountList[1] ?? accountList[0]).id);
    }
  }, [accountList, form]);

  // Currency auto-fills from the relevant account.
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

    try {
      const tx = await createMut.mutateAsync({
        type: v.type,
        description: v.description,
        amount,
        currency: v.currency,
        occurredAt: new Date(v.occurredAt).toISOString(),
        fromAccountId: v.type !== "INCOME" ? v.fromAccountId : undefined,
        toAccountId: v.type !== "EXPENSE" ? v.toAccountId : undefined,
        categoryId: v.type !== "TRANSFER" ? v.categoryId : undefined,
      });
      router.push(`/transactions/${tx.id}`);
    } catch (err) {
      handleApiError(err, { setError: form.setError });
    }
  }

  if (accountsLoading) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader
          title="New transaction"
          description="Record income, an expense, or a transfer."
        />
        <Card className="space-y-4 border-0 p-6 shadow-sm">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      </div>
    );
  }

  if (noAccounts) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader
          title="New transaction"
          description="Record income, an expense, or a transfer."
        />
        <EmptyState
          icon={Wallet}
          title="Add an account first"
          description="You need at least one account before recording a transaction."
          action={
            <Button onClick={() => setAccountDialogOpen(true)}>
              Add account
            </Button>
          }
        />
        <AccountDialog
          open={accountDialogOpen}
          onOpenChange={setAccountDialogOpen}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="New transaction"
        description="Record income, an expense, or a transfer."
      />

      <Card className="border-0 p-6 shadow-sm">
        <Form {...form}>
          <form action={action} className="space-y-5">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <TypeSwitcher
                    value={field.value}
                    onChange={(t) => {
                      field.onChange(t);
                      // Clear category when switching to transfer.
                      if (t === "TRANSFER")
                        form.setValue("categoryId", undefined);
                    }}
                  />
                </FormItem>
              )}
            />

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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="Coffee with Sam" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Account pickers depend on type */}
            {type !== "INCOME" && (
              <FormField
                control={form.control}
                name="fromAccountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {type === "TRANSFER" ? "From account" : "Account"}
                    </FormLabel>
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
                    <FormLabel>
                      {type === "TRANSFER" ? "To account" : "Account"}
                    </FormLabel>
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

            {/* Category — not for transfers */}
            {type !== "TRANSFER" && (
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Category{" "}
                      <span className="font-normal text-muted-foreground">
                        (optional)
                      </span>
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

            <FormField
              control={form.control}
              name="occurredAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      className="tabular"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <SubmitButton pendingText="Recording…">
                Record transaction
              </SubmitButton>
            </div>
          </form>
        </Form>
      </Card>
    </div>
  );
}
