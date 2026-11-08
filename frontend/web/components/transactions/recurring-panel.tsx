"use client";

import { DatePicker } from "@/components/common/date-picker";
import { CategoryGlyph } from "@/components/categories/category-glyph";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { PauseCircle, Repeat } from "lucide-react";
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
import { categoryScope, sameOwnerAccounts, writableAccounts } from "@/lib/account-sharing";
import {
  useCancelRecurringTransaction,
  usePauseRecurringTransaction,
  useResumeRecurringTransaction,
  useUpdateRecurringTransaction,
} from "@/hooks/useTransactions";
import { formatDate, parseMoneyInput } from "@/lib/format";
import { handleApiError } from "@/lib/form-errors";
import {
  buildRecurringUpdate,
  recurringEndDateToIso,
  recurringFormValues,
  seriesAccountOptions,
  type RecurringFormValues,
} from "@/lib/recurring-edit";
import {
  seriesIntervalLabel,
  seriesIsActive,
  seriesIsOpen,
  seriesIsPaused,
  seriesNextOccurrence,
  seriesPausedLabel,
} from "@/lib/recurring-series";
import type { Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Shown on a series' root: cadence, next occurrence (or why paused), and edit (future occurrences
 * only), pause/resume or cancel (generated transactions are untouched).
 */
export function RecurringPanel({ tx }: { tx: Transaction }) {
  const next = seriesNextOccurrence(tx);
  const pausedLabel = seriesPausedLabel(tx);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
      <Badge variant={seriesIsActive(tx) ? "secondary" : "outline"} className="gap-1">
        <Repeat className="size-3" />
        {seriesIntervalLabel(tx)}
        {tx.recurringStatus === "CANCELLED" && " · Cancelled"}
      </Badge>
      {next && <span className="text-xs text-muted-foreground">Next on {formatDate(next)}</span>}
      {pausedLabel && <SeriesPausedNote label={pausedLabel} />}

      {seriesIsOpen(tx) && <RecurringSeriesActions tx={tx} className="ml-auto" />}
    </div>
  );
}

/** "Paused", or "Paused: <why it couldn't post>", in place of a series' next date. */
export function SeriesPausedNote({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium text-warning", className)}>
      <PauseCircle className="size-3 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Series actions shared by the detail page and the Recurring list. Cancelling keeps every
 * transaction; resuming skips what fell due while paused and is refused while it can't post.
 */
export function RecurringSeriesActions({ tx, className }: { tx: Transaction; className?: string }) {
  const [editOpen, setEditOpen] = React.useState(false);
  const { data: allAccounts } = useAccounts();
  // A series posts within one ledger, so it can only move to accounts with the same owner.
  const seriesAccount = (allAccounts ?? []).find(
    (a) => a.id === (tx.recurringFromAccountId ?? tx.recurringToAccountId),
  );
  const accounts = sameOwnerAccounts(writableAccounts(allAccounts ?? []), seriesAccount);
  const { data: categories } = useCategories("active", true, categoryScope(seriesAccount));
  const updateMut = useUpdateRecurringTransaction(tx.id);
  const pauseMut = usePauseRecurringTransaction(tx.id);
  const resumeMut = useResumeRecurringTransaction(tx.id);
  const cancelMut = useCancelRecurringTransaction(tx.id);
  const paused = seriesIsPaused(tx);

  const relevantCategories = (categories ?? []).filter((c) => c.type === tx.type);

  // What the dialog opened with; only fields that differ from it are sent.
  const [initial, setInitial] = React.useState(() => recurringFormValues(tx));
  const form = useForm<RecurringFormValues>({ defaultValues: initial });

  // Only accounts the series can post to: its currency, and for a transfer
  // not the account on the other side.
  const fromValue = useWatch({ control: form.control, name: "fromAccountId" });
  const toValue = useWatch({ control: form.control, name: "toAccountId" });
  const isTransfer = tx.type === "TRANSFER";
  const fromOptions = seriesAccountOptions(accounts, tx.currency, isTransfer ? toValue : undefined);
  const toOptions = seriesAccountOptions(accounts, tx.currency, isTransfer ? fromValue : undefined);

  function handleOpenChange(open: boolean) {
    if (open) {
      // Start from the series as it is now, not from an earlier open or save.
      const current = recurringFormValues(tx);
      setInitial(current);
      form.reset(current);
    }
    setEditOpen(open);
  }

  async function action() {
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    const values = form.getValues();
    if (!values.description.trim()) {
      form.setError("description", { message: "Add a short description." });
      return;
    }
    if (
      values.recurringEndDate !== initial.recurringEndDate &&
      values.recurringEndDate &&
      new Date(recurringEndDateToIso(values.recurringEndDate)) <= new Date()
    ) {
      form.setError("recurringEndDate", { message: "End date must be in the future." });
      return;
    }
    if (values.amountRaw !== initial.amountRaw && !parseMoneyInput(values.amountRaw)) {
      form.setError("amountRaw", { message: "Enter an amount greater than 0." });
      return;
    }
    const input = buildRecurringUpdate(tx.type, initial, values);
    if (Object.keys(input).length === 0) {
      setEditOpen(false);
      return;
    }
    try {
      await updateMut.mutateAsync(input);
      setEditOpen(false);
    } catch (err) {
      handleApiError(err, { setError: form.setError });
    }
  }

  // The series touches an account this person can't post to.
  if (tx.canEdit === false) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {paused && (
        <Button type="button" size="sm" disabled={resumeMut.isPending} onClick={() => resumeMut.mutate()}>
          Resume series
        </Button>
      )}
      <Dialog open={editOpen} onOpenChange={handleOpenChange}>
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
                          accounts={fromOptions}
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
                          accounts={toOptions}
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
                        <DatePicker clearable placeholder="No end date" value={field.value} onChange={field.onChange} />
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

      {!paused && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pauseMut.isPending}
          onClick={() => pauseMut.mutate()}
        >
          Pause series
        </Button>
      )}

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
              No further occurrences of &ldquo;{tx.description}&rdquo; will be generated.
              Transactions already recorded, this one included, are not affected.
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
  );
}
