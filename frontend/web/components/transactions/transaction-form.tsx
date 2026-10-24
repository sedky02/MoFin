"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArrowLeft, Plus, Repeat, Split, Trash2, Wallet } from "lucide-react";
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
import { CategoryChips } from "@/components/transactions/category-chips";
import { AccountSelect } from "@/components/transactions/account-select";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { CategoryDialog } from "@/components/categories/category-dialog";
import { useAccounts } from "@/hooks/useAccounts";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useSuggestedAccountId } from "@/hooks/useSuggestedAccount";
import { useCategories } from "@/hooks/useCategories";
import { useCreateTransaction, useUpdateTransaction } from "@/hooks/useTransactions";
import { useFormStash } from "@/hooks/use-form-stash";
import {
  makeTransactionSchema,
  transactionFormBase,
  type TransactionFormValues,
} from "@/lib/transaction-schema";
import { formatMoneyInput, parseMoneyInput, toDatetimeLocal } from "@/lib/format";
import { add } from "@/lib/decimal";
import { editBlockedByArchivedAccount, transactionFormValues } from "@/lib/transaction-edit";
import type { Transaction } from "@/lib/types";
import { handleApiError } from "@/lib/form-errors";

const DESCRIPTION_PLACEHOLDER: Record<string, string> = {
  EXPENSE: "Description, e.g. Coffee with Sam",
  INCOME: "Description, e.g. March salary",
  TRANSFER: "Description, e.g. Move to savings",
};

const UNSAVED_STASH_KEY = "mofin-unsaved-transaction";

const BLANK: TransactionFormValues = {
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
};

/**
 * The transaction form: records a new transaction, or, given `transaction`,
 * edits that one. Editing changes every field (the ledger lines are rewritten);
 * the recurrence of a series is edited from its page instead, so the Repeat
 * section is create-only. A recurring root keeps its type and currency, since
 * its series is generated from them.
 */
export function TransactionForm({ transaction }: { transaction?: Transaction }) {
  const router = useRouter();
  const editing = !!transaction;
  const recurringRoot = !!transaction?.isRecurring && !transaction.parentTransactionId;
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: categories } = useCategories();
  const createMut = useCreateTransaction({
    onView: (id) => router.push(`/transactions/${id}`),
    // The new transaction's page is gone once it's undone, so leave it.
    onUndone: (id) => {
      if (window.location.pathname.startsWith(`/transactions/${id}`)) router.push("/transactions");
    },
  });
  const updateMut = useUpdateTransaction(transaction?.id ?? "");

  const accountList = accounts ?? [];
  const selectableAccounts = recurringRoot
    ? accountList.filter((a) => a.currency === transaction.currency)
    : accountList;
  const schema = makeTransactionSchema(accountList);

  const noAccounts = !accountsLoading && accountList.length === 0;
  const [accountDialogOpen, setAccountDialogOpen] = React.useState(false);

  // The saved values an edit starts from (and Reset goes back to).
  const initialValues = React.useMemo(
    () => (transaction ? transactionFormValues(transaction) : BLANK),
    [transaction],
  );
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
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

  // A split's categories live on its lines, so the pre-split pick moves to the first line
  // instead of staying on the transaction too (the API rejects a split with both).
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
    form.setValue("categoryId", undefined);
  }
  // Undoing the split hands the first line's category back to the transaction.
  function cancelSplit() {
    const firstLineCategory = form.getValues("items")?.[0]?.categoryId;
    itemsArray.replace([]);
    if (firstLineCategory) form.setValue("categoryId", firstLineCategory);
  }
  const [confirmTransfer, setConfirmTransfer] = React.useState(false);
  // Which category field the "New category" dialog was opened from: the main one or a split row.
  const [newCategoryFor, setNewCategoryFor] = React.useState<"main" | number | null>(null);
  function selectCreatedCategory(c: { id: string; type: string }) {
    // A category of the other type wouldn't appear in this form's list, so leave the field alone.
    if (c.type !== form.getValues("type")) return;
    if (newCategoryFor === "main") form.setValue("categoryId", c.id, { shouldDirty: true });
    else if (typeof newCategoryFor === "number")
      form.setValue(`items.${newCategoryFor}.categoryId`, c.id, { shouldDirty: true });
  }
  // A category belongs to one type, so a type change drops every pick: the chips and
  // split rows only list the new type's categories, and a stale id would still be sent.
  function clearCategories() {
    form.setValue("categoryId", undefined);
    // "" not undefined: react-hook-form falls back to a row's default (the pre-split pick) for undefined.
    (form.getValues("items") ?? []).forEach((_, i) => form.setValue(`items.${i}.categoryId`, ""));
  }
  function switchToTransfer() {
    form.setValue("type", "TRANSFER");
    clearCategories();
    cancelSplit();
  }

  // With the currency's decimals ("96.30", not "96.3"), like a typed amount after blur.
  const itemsTotal = formatMoneyInput(
    (watchedItems ?? []).reduce((sum, item) => add(sum, parseMoneyInput(item.amountRaw) ?? "0"), "0"),
    currency || undefined,
  );

  // While split, the total is derived from the items — not independently entered.
  React.useEffect(() => {
    if (splitting) {
      form.setValue("amountRaw", itemsTotal, { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitting, itemsTotal]);

  // Accounts. The form only stores an account the user picked; what is shown and
  // submitted is derived, so there is no "was this hand-picked?" state to get wrong:
  //   picked account → else the suggested one (active → main → only → most used → first).
  // For a transfer's destination the default is another account in the same currency.
  const suggestedAccountId = useSuggestedAccountId();
  const { accountId: activeAccountId } = useActiveAccount();
  const inList = (id?: string) => (id && accountList.some((a) => a.id === id) ? id : undefined);
  const effectiveFromId = inList(fromAccountId) ?? suggestedAccountId;
  const effectiveToId =
    inList(toAccountId) ??
    (type === "INCOME"
      ? suggestedAccountId
      : (() => {
          const from = accountList.find((a) => a.id === effectiveFromId);
          const others = accountList.filter((a) => a.id !== effectiveFromId);
          return (others.find((a) => a.currency === from?.currency) ?? others[0] ?? accountList[0])?.id;
        })());

  // Switching the active account is a deliberate choice, so it replaces any picked account.
  // Not while editing: the transaction's own accounts are what's being edited.
  const lastActiveId = React.useRef(activeAccountId);
  React.useEffect(() => {
    if (editing || lastActiveId.current === activeAccountId) return;
    lastActiveId.current = activeAccountId;
    form.setValue("fromAccountId", undefined);
    form.setValue("toAccountId", undefined);
  }, [activeAccountId, editing, form]);

  // If the session expires mid-save, the input waits in sessionStorage while the
  // user signs in again and comes back here. After the effect above, so the
  // active account settling on load doesn't clear restored accounts; a stash
  // naming accounts this user doesn't have isn't theirs, so it's dropped.
  const restored = useFormStash(form, editing ? `${UNSAVED_STASH_KEY}:${transaction.id}` : UNSAVED_STASH_KEY, {
    ready: !accountsLoading,
    accept: (v) =>
      transactionFormBase.partial().safeParse(v).success &&
      [v.fromAccountId, v.toAccountId].every((id) => !id || accountList.some((a) => a.id === id)),
  });

  // Currency follows the account the money moves through.
  const sourceAccountId = type === "INCOME" ? effectiveToId : effectiveFromId;
  React.useEffect(() => {
    const acct = accountList.find((a) => a.id === sourceAccountId);
    if (acct && acct.currency !== currency) {
      form.setValue("currency", acct.currency, { shouldValidate: false });
    }
  }, [sourceAccountId, accountList, currency, form]);

  const relevantCategories = (categories ?? []).filter((c) =>
    type === "TRANSFER" ? false : c.type === type,
  );

  // Back to a blank expense (the account falls back to the suggested default), or,
  // when editing, back to the transaction as saved.
  function resetForm() {
    form.reset(editing ? initialValues : { ...BLANK, occurredAt: toDatetimeLocal(), items: [] });
  }

  async function action() {
    // Commit the derived accounts so validation and submit see what the user sees.
    const picks = { from: fromAccountId, to: toAccountId };
    form.setValue("fromAccountId", effectiveFromId);
    form.setValue("toAccountId", effectiveToId);
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) {
      // Don't let a failed submit turn the defaults into "picked" accounts.
      form.setValue("fromAccountId", picks.from);
      form.setValue("toAccountId", picks.to);
      return;
    }
    const v = form.getValues();
    const amount = parseMoneyInput(v.amountRaw);
    if (!amount) return;

    const splitItems =
      splitting && v.items && v.items.length > 1
        ? v.items.map((item) => ({
            amount: parseMoneyInput(item.amountRaw)!,
            categoryId: item.categoryId || undefined,
            memo: item.description?.trim() || undefined,
          }))
        : undefined;

    const fields = {
      type: v.type,
      description: v.description,
      amount,
      currency: v.currency,
      occurredAt: new Date(v.occurredAt).toISOString(),
      fromAccountId: v.type !== "INCOME" ? v.fromAccountId : undefined,
      toAccountId: v.type !== "EXPENSE" ? v.toAccountId : undefined,
      categoryId: v.type !== "TRANSFER" && !splitItems ? v.categoryId : undefined,
      items: splitItems,
    };

    try {
      if (editing) {
        await updateMut.mutateAsync(fields);
        router.push(`/transactions/${transaction.id}`);
        return;
      }
      const tx = await createMut.mutateAsync({
        ...fields,
        isRecurring: !splitting && v.isRecurring ? true : undefined,
        recurringInterval: !splitting && v.isRecurring ? v.recurringInterval : undefined,
        recurringEndDate:
          !splitting && v.isRecurring && v.recurringEndDate
            ? new Date(`${v.recurringEndDate}T23:59:59`).toISOString()
            : undefined,
      });
      resetForm();
      router.push(`/transactions/${tx.id}`);
    } catch (err) {
      handleApiError(err, { setError: form.setError });
    }
  }

  const heading = editing
    ? { title: "Edit transaction", description: "Change any detail. Balances, summaries and goals follow." }
    : { title: "New transaction", description: "Record an expense, income or transfer." };
  const backToTransaction = editing && (
    <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5 text-muted-foreground">
      <Link href={`/transactions/${transaction.id}`}>
        <ArrowLeft className="size-4" />
        Back to transaction
      </Link>
    </Button>
  );

  // Nothing can be posted to an archived account, so a transaction on one can't be edited.
  if (editing && editBlockedByArchivedAccount(transaction)) {
    return (
      <div className="mx-auto max-w-xl">
        {backToTransaction}
        <PageHeader title={heading.title} />
        <EmptyState
          icon={Archive}
          title="This transaction is on an archived account"
          description="Archived accounts are read-only. Restore the account to edit this transaction, or delete the transaction instead."
        />
      </div>
    );
  }

  if (accountsLoading) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title={heading.title} description={heading.description} />
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
        <PageHeader title={heading.title} description={heading.description} />
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
    <div className="mx-auto max-w-lg pb-10">
      {backToTransaction}
      <header className="mb-8 text-center">
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{heading.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{heading.description}</p>
      </header>

      {restored && (
        <p role="status" className="mb-4 rounded-xl bg-muted px-4 py-3 text-center text-sm">
          Restored your unsaved transaction.
        </p>
      )}

      <div className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border/60 sm:p-8">
        <Form {...form}>
          <form action={action} className="space-y-6">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <TypeSwitcher
                    disabled={recurringRoot}
                    value={field.value}
                    onChange={(t) => {
                      // Transfers have no category and can't be split — don't silently
                      // throw away split rows the user already entered.
                      if (t === "TRANSFER" && splitting) {
                        setConfirmTransfer(true);
                        return;
                      }
                      if (t === field.value) return;
                      field.onChange(t);
                      clearCategories();
                    }}
                  />
                  {recurringRoot && (
                    <p className="text-center text-xs text-muted-foreground">
                      A recurring series keeps its type and currency.
                    </p>
                  )}
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amountRaw"
              render={({ field }) => (
                <FormItem className="rounded-2xl bg-muted/50 px-4 py-6">
                  <FormLabel className="sr-only">Amount</FormLabel>
                  <FormControl>
                    <MoneyInput
                      large
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      currency={currency || undefined}
                      disabled={splitting}
                      aria-invalid={!!form.formState.errors.amountRaw}
                    />
                  </FormControl>
                  {splitting ? (
                    <p className="text-center text-xs text-muted-foreground">Calculated from the items below.</p>
                  ) : (
                    <FormMessage className="text-center" />
                  )}
                </FormItem>
              )}
            />

            {/* What was it for? Description + one-tap category in one grouped surface. */}
            <div className="rounded-2xl bg-muted/50 p-4">
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="sr-only">Description</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={DESCRIPTION_PLACEHOLDER[type] ?? DESCRIPTION_PLACEHOLDER.EXPENSE}
                        className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {type !== "TRANSFER" && !splitting && (
                <>
                  <div className="my-3 h-px bg-border/70" />
                  <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">Category (optional)</FormLabel>
                        <CategoryChips
                          categories={relevantCategories}
                          value={field.value}
                          onChange={(id) => field.onChange(id)}
                          onCreate={() => setNewCategoryFor("main")}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
            </div>

            {/* A recurring transaction can't be split (create refuses it too). */}
            {type !== "TRANSFER" && !splitting && !recurringRoot && (
              <div className="-mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={startSplit}
                  className="flex items-center gap-1.5 text-sm font-medium text-primary-text transition-opacity hover:opacity-70"
                >
                  <Split className="size-4" />
                  Split transaction
                </button>
              </div>
            )}


            {/* Split items */}
            {type !== "TRANSFER" && splitting && (
              <div className="space-y-3 rounded-2xl bg-muted/50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Split into {itemsArray.fields.length} items
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto min-h-6 p-1.5 text-xs"
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
                              <FormLabel className="sr-only">Item {i + 1} amount</FormLabel>
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
                              <FormLabel className="sr-only">Item {i + 1} category</FormLabel>
                              <Select
                                // "" (not undefined) so a cleared row shows the placeholder again.
                                value={catField.value ?? ""}
                                onValueChange={(v) => catField.onChange(v || undefined)}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Uncategorized" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {relevantCategories.length === 0 && (
                          <p className="px-2 py-1.5 text-sm text-muted-foreground">
                            No categories yet — add one on the Categories page.
                          </p>
                        )}
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
                          className="shrink-0 text-muted-foreground"
                          aria-label={`New category for item ${i + 1}`}
                          onClick={() => setNewCategoryFor(i)}
                        >
                          <Plus className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={itemsArray.fields.length <= 2}
                          onClick={() => itemsArray.remove(i)}
                          aria-label={`Remove item ${i + 1}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>

                      <FormField
                        control={form.control}
                        name={`items.${i}.description`}
                        render={({ field: descField }) => (
                          <FormItem>
                            <FormLabel className="sr-only">Item {i + 1} note</FormLabel>
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
                    className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground transition-transform active:scale-95"
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

            <div className="grid gap-4 sm:grid-cols-2">
              {type !== "INCOME" && (
              <FormField
                control={form.control}
                name="fromAccountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-muted-foreground">
                      {type === "TRANSFER" ? "From" : "Account"}
                    </FormLabel>
                    <FormControl>
                      <AccountSelect
                        accounts={selectableAccounts}
                        value={effectiveFromId}
                        onChange={field.onChange}
                        className="data-[size=default]:h-12 rounded-xl border-0 bg-muted/50 shadow-none dark:bg-muted/50 dark:hover:bg-muted/70"
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
                    <FormLabel className="text-xs font-medium text-muted-foreground">
                      {type === "TRANSFER" ? "To" : "Account"}
                    </FormLabel>
                    <FormControl>
                      <AccountSelect
                        accounts={selectableAccounts}
                        value={effectiveToId}
                        onChange={field.onChange}
                        className="data-[size=default]:h-12 rounded-xl border-0 bg-muted/50 shadow-none dark:bg-muted/50 dark:hover:bg-muted/70"
                        aria-invalid={!!form.formState.errors.toAccountId}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              )}
              <FormField
                control={form.control}
                name="occurredAt"
                render={({ field }) => (
                  <FormItem className={type === "TRANSFER" ? "sm:col-span-2" : undefined}>
                    <FormLabel className="text-xs font-medium text-muted-foreground">Date</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" className="tabular h-12 rounded-xl border-0 bg-muted/50 shadow-none dark:bg-muted/50" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {!splitting && !editing && (
              <div className="space-y-4 rounded-2xl bg-muted/50 p-4">
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

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                className="h-12 flex-1 rounded-xl text-base"
                onClick={resetForm}
                disabled={!form.formState.isDirty}
              >
                Reset
              </Button>
              <SubmitButton pendingText="Saving…" className="h-12 flex-1 rounded-xl text-base">
                {editing ? "Save changes" : "Save transaction"}
              </SubmitButton>
            </div>
          </form>
        </Form>
      </div>

      {/* Outside <Form>: a portalled dialog's submit would otherwise bubble into the transaction form. */}
      <CategoryDialog
        open={newCategoryFor !== null}
        onOpenChange={(o) => !o && setNewCategoryFor(null)}
        defaultType={type === "INCOME" ? "INCOME" : "EXPENSE"}
        onCreated={selectCreatedCategory}
      />

      <ConfirmDialog
        open={confirmTransfer}
        onOpenChange={setConfirmTransfer}
        title="Switch to Transfer?"
        description="Transfers can't be split or categorised, so the split items you entered will be removed."
        confirmLabel="Switch to Transfer"
        onConfirm={() => {
          setConfirmTransfer(false);
          switchToTransfer();
        }}
      />
    </div>
  );
}
