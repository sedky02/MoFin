"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "@/components/common/money-input";
import { AccountSelect } from "@/components/transactions/account-select";
import { SubmitButton } from "@/components/common/submit-button";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import {
  useCancelRecurringTransaction,
  useUpdateRecurringTransaction,
} from "@/hooks/useTransactions";
import { formatDate, formatMoneyInput, parseMoneyInput } from "@/lib/format";
import { handleApiError } from "@/lib/form-errors";
import type { Transaction } from "@/lib/types";

interface RecurringFormValues {
  description: string;
  amountRaw: string;
  categoryId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  recurringInterval: "MONTHLY" | "YEARLY";
  recurringEndDate: string;
}

/**
 * Shown on the root transaction of a recurring series. Displays cadence +
 * next occurrence, and lets the user edit the template (future occurrences
 * only) or cancel the series (stops future generation; nothing already
 * generated is touched).
 */
export function RecurringPanel({ tx }: { tx: Transaction }) {
  const [editOpen, setEditOpen] = React.useState(false);
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const updateMut = useUpdateRecurringTransaction(tx.id);
  const cancelMut = useCancelRecurringTransaction(tx.id);

  const accountList = accounts ?? [];
  const relevantCategories = (categories ?? []).filter((c) => c.type === tx.type);
  const isCancelled = tx.recurringStatus === "CANCELLED";

  const form = useForm<RecurringFormValues>({
    defaultValues: {
      description: tx.description,
      amountRaw: formatMoneyInput(tx.recurringAmount ?? "0"),
      categoryId: tx.categoryId ?? undefined,
      fromAccountId: tx.recurringFromAccountId ?? undefined,
      toAccountId: tx.recurringToAccountId ?? undefined,
      recurringInterval: (tx.recurringInterval as "MONTHLY" | "YEARLY") ?? "MONTHLY",
      recurringEndDate: tx.recurringEndDate ? tx.recurringEndDate.slice(0, 10) : "",
    },
  });

  async function action() {
    const valid = await form.trigger();
    if (!valid) return;
    const values = form.getValues();
    const amount = parseMoneyInput(values.amountRaw);
    if (!amount) {
      form.setError("amountRaw", { message: "Enter an amount greater than 0." });
      return;
    }
    try {
      await updateMut.mutateAsync({
        description: values.description,
        amount,
        categoryId: values.categoryId ?? null,
        fromAccountId: tx.type !== "INCOME" ? values.fromAccountId : undefined,
        toAccountId: tx.type !== "EXPENSE" ? values.toAccountId : undefined,
        recurringInterval: values.recurringInterval,
        recurringEndDate: values.recurringEndDate
          ? new Date(values.recurringEndDate).toISOString()
          : null,
      });
      setEditOpen(false);
    } catch (err) {
      handleApiError(err, { setError: form.setError });
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
      <Badge variant={isCancelled ? "outline" : "secondary"} className="gap-1">
        <Repeat className="size-3" />
        {tx.recurringInterval === "YEARLY" ? "Yearly" : "Monthly"}
        {isCancelled && " · Cancelled"}
      </Badge>
      {!isCancelled && tx.nextOccurrenceAt && (
        <span className="text-xs text-muted-foreground">
          Next on {formatDate(tx.nextOccurrenceAt)}
        </span>
      )}

      {!isCancelled && (
        <div className="ml-auto flex gap-2">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                Edit series
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit recurring transaction</DialogTitle>
                <DialogDescription>
                  Changes only affect occurrences generated from now on.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form action={action} className="space-y-4">
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
                            currency={tx.currency}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {tx.type !== "INCOME" && (
                    <FormField
                      control={form.control}
                      name="fromAccountId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{tx.type === "TRANSFER" ? "From account" : "Account"}</FormLabel>
                          <FormControl>
                            <AccountSelect
                              accounts={accountList}
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {tx.type !== "EXPENSE" && (
                    <FormField
                      control={form.control}
                      name="toAccountId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{tx.type === "TRANSFER" ? "To account" : "Account"}</FormLabel>
                          <FormControl>
                            <AccountSelect
                              accounts={accountList}
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {tx.type !== "TRANSFER" && (
                    <FormField
                      control={form.control}
                      name="categoryId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Category{" "}
                            <span className="font-normal text-muted-foreground">(optional)</span>
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
                                  {c.icon ? `${c.icon} ` : ""}
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
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
                                <SelectValue />
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
                            Ends <span className="font-normal text-muted-foreground">(optional)</span>
                          </FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <DialogFooter>
                    <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                Cancel series
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel recurring transaction?</AlertDialogTitle>
                <AlertDialogDescription>
                  No further occurrences will be generated. Transactions already recorded are
                  not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => cancelMut.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Cancel series
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
