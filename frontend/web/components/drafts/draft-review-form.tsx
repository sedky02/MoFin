"use client";

import { DateTimePicker } from "@/components/common/date-picker";
import { CategoryGlyph } from "@/components/categories/category-glyph";
import * as React from "react";
import { useFieldArray, useForm } from "react-hook-form";
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
import { categoryScope, sameOwnerAccounts, writableAccounts } from "@/lib/account-sharing";
import { makeTransactionSchema, type TransactionFormValues } from "@/lib/transaction-schema";
import { handleApiError } from "@/lib/form-errors";
import { formatMoneyInput, parseMoneyInput, toDatetimeLocal } from "@/lib/format";
import { add } from "@/lib/decimal";
import { draftAmountInput, draftItemFormValues, draftItemsPayload } from "@/lib/draft-review";
import type { DraftTransaction, ParsedTransactionData } from "@/lib/types";
import { Loader2, Plus, Trash2 } from "lucide-react";

export function DraftReviewForm({
  draft,
  approving,
  onApprove,
  onCancel,
}: {
  draft: DraftTransaction;
  approving: boolean;
  onApprove: (edits: Partial<ParsedTransactionData>) => void | Promise<void>;
  onCancel: () => void;
}) {
  const { data: accounts } = useAccounts();
  const accountList = writableAccounts(accounts ?? []);
  const schema = makeTransactionSchema(accountList);

  const p = draft.parsedData;
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: p.type ?? "EXPENSE",
      description: p.description ?? draft.rawInput,
      amountRaw: draftAmountInput(p),
      currency: p.currency ?? "",
      fromAccountId: p.fromAccountId ?? undefined,
      toAccountId: p.toAccountId ?? undefined,
      categoryId: p.categoryId ?? undefined,
      occurredAt: toDatetimeLocal(p.occurredAt),
      items: draftItemFormValues(p),
    },
  });

  const type = form.watch("type");
  const fromAccountId = form.watch("fromAccountId");
  const toAccountId = form.watch("toAccountId");
  const currency = form.watch("currency");
  const watchedItems = form.watch("items");
  const itemsArray = useFieldArray({ control: form.control, name: "items" });
  const splitting = itemsArray.fields.length > 1;
  const itemsTotal = formatMoneyInput(
    (watchedItems ?? []).reduce((sum, item) => add(sum, parseMoneyInput(item.amountRaw) ?? "0"), "0"),
    currency || undefined,
  );

  // While split, the total is derived from the lines, not entered separately.
  React.useEffect(() => {
    if (splitting) form.setValue("amountRaw", itemsTotal, { shouldValidate: false });
  }, [splitting, itemsTotal, form]);

  // Pre-select a default account once accounts load, when the parser left it empty.
  React.useEffect(() => {
    if (accountList.length === 0) return;
    if (!form.getValues("fromAccountId")) {
      form.setValue("fromAccountId", accountList[0].id);
    }
    if (!form.getValues("toAccountId")) {
      form.setValue("toAccountId", (accountList[1] ?? accountList[0]).id);
    }
  }, [accountList, form]);

  const sourceAccountId = type === "INCOME" ? toAccountId : fromAccountId;
  React.useEffect(() => {
    const acct = accountList.find((a) => a.id === sourceAccountId);
    if (acct && acct.currency !== currency) {
      form.setValue("currency", acct.currency, { shouldValidate: false });
    }
  }, [sourceAccountId, accountList, currency, form]);

  // A shared account uses its owner's categories, so moving the draft can drop the pick.
  const ledgerAccount = accountList.find((a) => a.id === sourceAccountId);
  const categorySet = categoryScope(ledgerAccount);
  const { data: categories } = useCategories("active", true, categorySet);
  const previousCategorySet = React.useRef(categorySet);
  React.useEffect(() => {
    if (!accountList.length || previousCategorySet.current === categorySet) return;
    previousCategorySet.current = categorySet;
    form.setValue("categoryId", undefined);
    // "" not undefined: react-hook-form falls back to the row default for undefined.
    (form.getValues("items") ?? []).forEach((_, i) => form.setValue(`items.${i}.categoryId`, ""));
  }, [categorySet, accountList.length, form]);

  const destinationAccounts =
    type === "TRANSFER"
      ? sameOwnerAccounts(accountList, accountList.find((a) => a.id === fromAccountId))
      : accountList;

  const relevantCategories = (categories ?? []).filter((c) =>
    type === "TRANSFER" ? false : c.type === type,
  );

  async function action() {
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    const v = form.getValues();
    const amount = parseMoneyInput(v.amountRaw);
    if (!amount) return;
    const items = v.type !== "TRANSFER" ? draftItemsPayload(v.items) : undefined;
    try {
      await onApprove({
      type: v.type,
      description: v.description,
      amount,
      currency: v.currency,
      occurredAt: new Date(v.occurredAt).toISOString(),
      fromAccountId: v.type !== "INCOME" ? v.fromAccountId : undefined,
      toAccountId: v.type !== "EXPENSE" ? v.toAccountId : undefined,
      categoryId: v.type !== "TRANSFER" && !items ? v.categoryId : undefined,
      items: items ?? null,
      });
    } catch (err) {
      // Backend field errors (e.g. bad account/currency) land on the field the user can fix.
      handleApiError(err, { setError: form.setError });
    }
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
                  if (t === field.value) return;
                  field.onChange(t);
                  // Categories are per type; a kept id would be hidden but still sent.
                  form.setValue("categoryId", undefined);
                  (form.getValues("items") ?? []).forEach((_, i) =>
                    form.setValue(`items.${i}.categoryId`, ""),
                  );
                  if (t === "TRANSFER") itemsArray.replace([]);
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
                    disabled={splitting}
                    aria-invalid={!!form.formState.errors.amountRaw}
                  />
                </FormControl>
                {splitting && (
                  <p className="text-xs text-muted-foreground">Calculated from the items below.</p>
                )}
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
                  <DateTimePicker value={field.value} onChange={field.onChange} />
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
                      accounts={destinationAccounts}
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

        {type !== "TRANSFER" && splitting && (
          <div className="space-y-3 rounded-2xl bg-muted/50 p-4">
            <p className="text-sm font-medium">Split into {itemsArray.fields.length} items</p>
            {itemsArray.fields.map((field, i) => (
              <div key={field.id} className="flex items-start gap-2">
                <span className="mt-2.5 w-4 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
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
                              aria-invalid={!!form.formState.errors.items?.[i]?.amountRaw}
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
                            value={catField.value ?? ""}
                            onValueChange={(v) => catField.onChange(v || undefined)}
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
                                    <CategoryGlyph category={c} className="size-4" />
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
            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  itemsArray.append({ amountRaw: "", categoryId: undefined, description: "" })
                }
              >
                <Plus className="size-4" />
                Add item
              </Button>
              <p className="text-xs text-muted-foreground">
                Total: {itemsTotal} {currency}
              </p>
            </div>
          </div>
        )}

        {type !== "TRANSFER" && !splitting && (
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Category <span className="font-normal text-muted-foreground">(optional)</span>
                </FormLabel>
                <Select
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
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
                          <CategoryGlyph category={c} className="size-4" />
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
