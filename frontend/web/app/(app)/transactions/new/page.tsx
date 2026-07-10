"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Repeat, Trash2, Wallet } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
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
import { add } from "@/lib/decimal";
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
      isRecurring: false,
      recurringInterval: undefined,
      recurringEndDate: "",
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
  const watchedItems = form.watch("items");
  const isRecurring = form.watch("isRecurring");

  const itemsArray = useFieldArray({ control: form.control, name: "items" });
  const splitting = itemsArray.fields.length > 1;

  function startSplit() {
    form.setValue("isRecurring", false);
    itemsArray.replace([
      {
        amountRaw: form.getValues("amountRaw"),
        categoryId: form.getValues("categoryId"),
        description: "",
      },
      { amountRaw: "", categoryId: undefined, description: "" },
    ]);
  }
  function cancelSplit() {
    itemsArray.replace([]);
  }

  const itemsTotal = (watchedItems ?? []).reduce(
    (sum, item) => add(sum, parseMoneyInput(item.amountRaw) ?? "0"),
    "0",
  );

  // While split, the total is derived from the items — not independently entered.
  React.useEffect(() => {
    if (splitting) {
      form.setValue("amountRaw", itemsTotal, { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitting, itemsTotal]);

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

    const splitItems =
      splitting && v.items && v.items.length > 1
        ? v.items.map((item) => ({
            amount: parseMoneyInput(item.amountRaw)!,
            categoryId: item.categoryId,
            memo: item.description?.trim() || undefined,
          }))
        : undefined;

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
        items: splitItems,
        isRecurring: !splitting && v.isRecurring ? true : undefined,
        recurringInterval: !splitting && v.isRecurring ? v.recurringInterval : undefined,
        recurringEndDate:
          !splitting && v.isRecurring && v.recurringEndDate
            ? new Date(v.recurringEndDate).toISOString()
            : undefined,
      });
      form.reset({
        type: "EXPENSE",
        description: "",
        amountRaw: "",
        currency: "",
        fromAccountId: undefined,
        toAccountId: undefined,
        categoryId: undefined,
        occurredAt: toDatetimeLocal(),
        items: [],
        isRecurring: false,
        recurringInterval: undefined,
        recurringEndDate: "",
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
                      // Transfers have no category and can't be split.
                      if (t === "TRANSFER") {
                        form.setValue("categoryId", undefined);
                        cancelSplit();
                      }
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
                      disabled={splitting}
                      aria-invalid={!!form.formState.errors.amountRaw}
                    />
                  </FormControl>
                  {splitting ? (
                    <p className="text-xs text-muted-foreground">
                      Calculated from the items below.
                    </p>
                  ) : (
                    <FormMessage />
                  )}
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

            {/* Category — plain, unsplit form */}
            {type !== "TRANSFER" && !splitting && (
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

                    <button
                      type="button"
                      onClick={startSplit}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                    >
                      <Plus className="size-4" />
                      Split into multiple items
                    </button>
                  </FormItem>
                )}
              />
            )}

            {/* Split items */}
            {type !== "TRANSFER" && splitting && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Split into {itemsArray.fields.length} items
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={cancelSplit}
                  >
                    Remove split
                  </Button>
                </div>

                {itemsArray.fields.map((field, i) => (
                  <div key={field.id} className="flex items-start gap-2">
                    <span className="mt-2.5 w-4 shrink-0 text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start gap-2">
                        <FormField
                          control={form.control}
                          name={`items.${i}.amountRaw`}
                          render={({ field: amountField }) => (
                            <FormItem className="w-28 shrink-0">
                              <FormControl>
                                <MoneyInput
                                  value={amountField.value ?? ""}
                                  onChange={amountField.onChange}
                                  onBlur={amountField.onBlur}
                                  currency={currency || undefined}
                                  aria-invalid={
                                    !!form.formState.errors.items?.[i]?.amountRaw
                                  }
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${i}.categoryId`}
                          render={({ field: catField }) => (
                            <FormItem className="flex-1">
                              <Select
                                value={catField.value}
                                onValueChange={catField.onChange}
                              >
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
                            </FormItem>
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={itemsArray.fields.length <= 2}
                          onClick={() => itemsArray.remove(i)}
                          aria-label="Remove item"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>

                      <FormField
                        control={form.control}
                        name={`items.${i}.description`}
                        render={({ field: descField }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                placeholder="Item description (optional)"
                                className="text-sm"
                                {...descField}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ))}

                {form.formState.errors.items?.root?.message && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.items.root.message}
                  </p>
                )}
                {typeof form.formState.errors.items?.message === "string" && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.items.message}
                  </p>
                )}

                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      itemsArray.append({ amountRaw: "", categoryId: undefined, description: "" })
                    }
                    className="acid-glow flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground transition-transform active:scale-95"
                  >
                    <Plus className="size-4" />
                    Add item
                  </button>
                </div>

                <p className="text-right text-xs text-muted-foreground">
                  Total: {itemsTotal} {currency}
                </p>
              </div>
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

            {!splitting && (
              <div className="space-y-4 rounded-lg border border-border p-3">
                <FormField
                  control={form.control}
                  name="isRecurring"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-2">
                      <FormLabel className="flex items-center gap-1.5 font-medium">
                        <Repeat className="size-4 text-muted-foreground" />
                        Repeat this transaction
                      </FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {isRecurring && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="recurringInterval"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Every</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Choose interval" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="MONTHLY">Month</SelectItem>
                              <SelectItem value="YEARLY">Year</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="recurringEndDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Ends{" "}
                            <span className="font-normal text-muted-foreground">
                              (optional)
                            </span>
                          </FormLabel>
                          <FormControl>
                            <Input type="date" className="tabular" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
            )}

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
