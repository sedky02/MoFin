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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/common/submit-button";
import { MoneyInput } from "@/components/common/money-input";
import { AccountSelect } from "@/components/transactions/account-select";
import { useAccounts } from "@/hooks/useAccounts";
import { useCreateGoal, useUpdateGoal } from "@/hooks/useGoals";
import { parseMoneyInput } from "@/lib/format";
import type { Goal } from "@/lib/types";

const GOAL_TYPES = [
  { value: "BALANCE", label: "Balance — reach an account balance" },
  { value: "INCOME", label: "Income — reach an income total" },
  { value: "EXPENSE", label: "Expense — stay under a spending cap" },
] as const;

const schema = z
  .object({
    accountId: z.string().min(1, "Select an account."),
    name: z.string().trim().min(1, "Name is required.").max(60),
    type: z.enum(["BALANCE", "INCOME", "EXPENSE"]),
    targetAmount: z.string().refine((v) => !!parseMoneyInput(v), "Enter a valid amount."),
    isRecurring: z.boolean(),
    recurrenceUnit: z.enum(["MONTH", "YEAR"]).optional(),
    periodStart: z.string().min(1, "Start date is required."),
    periodEnd: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.isRecurring && !value.recurrenceUnit) {
      ctx.addIssue({ code: "custom", path: ["recurrenceUnit"], message: "Pick how often this goal repeats." });
    }
    if (!value.isRecurring && !value.periodEnd) {
      ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "End date is required for a fixed goal." });
    }
    if (!value.isRecurring && value.periodEnd && value.periodEnd <= value.periodStart) {
      ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "End date must be after the start date." });
    }
  });
type Values = z.infer<typeof schema>;

const DEFAULTS: Values = {
  accountId: "",
  name: "",
  type: "BALANCE",
  targetAmount: "",
  isRecurring: false,
  recurrenceUnit: undefined,
  periodStart: new Date().toISOString().slice(0, 10),
  periodEnd: "",
};

export function GoalDialog({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: Goal; // present → edit mode (name + target amount only; the rest is frozen once created)
}) {
  const isEdit = !!goal;
  const { data: accounts } = useAccounts();
  const createMut = useCreateGoal();
  const updateMut = useUpdateGoal();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  });

  React.useEffect(() => {
    if (!open) return;
    form.reset(
      goal
        ? {
            accountId: goal.accountId,
            name: goal.name,
            type: goal.type,
            targetAmount: goal.targetAmount,
            isRecurring: goal.isRecurring,
            recurrenceUnit: goal.recurrenceUnit ?? undefined,
            periodStart: goal.periodStart.slice(0, 10),
            periodEnd: goal.periodEnd?.slice(0, 10) ?? "",
          }
        : DEFAULTS,
    );
  }, [open, goal, form]);

  const isRecurring = form.watch("isRecurring");

  async function action() {
    const valid = await form.trigger();
    if (!valid) return;
    const values = form.getValues();
    try {
      if (isEdit) {
        await updateMut.mutateAsync({
          id: goal.id,
          name: values.name,
          targetAmount: values.targetAmount,
        });
      } else {
        await createMut.mutateAsync({
          accountId: values.accountId,
          name: values.name,
          type: values.type,
          targetAmount: values.targetAmount,
          isRecurring: values.isRecurring,
          recurrenceUnit: values.isRecurring ? values.recurrenceUnit : undefined,
          periodStart: values.periodStart,
          periodEnd: values.isRecurring ? undefined : values.periodEnd,
        });
      }
      onOpenChange(false);
    } catch {
      // handled by hook's onError toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit goal" : "New goal"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this goal's name or target amount."
              : "Set a balance, income or expense target for one of your accounts."}
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
                    <Input placeholder="Emergency fund" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account</FormLabel>
                  <FormControl>
                    <AccountSelect
                      accounts={accounts ?? []}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isEdit}
                    />
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
                  <FormLabel>Goal type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isEdit}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {GOAL_TYPES.map((t) => (
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
              name="targetAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target amount</FormLabel>
                  <FormControl>
                    <MoneyInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isEdit && (
              <>
                <FormField
                  control={form.control}
                  name="isRecurring"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                      <div>
                        <FormLabel>Recurring</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Automatically start a new period once this one ends.
                        </p>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {isRecurring ? (
                  <FormField
                    control={form.control}
                    name="recurrenceUnit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Repeats every</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select an interval" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="MONTH">Month</SelectItem>
                            <SelectItem value="YEAR">Year</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="periodEnd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="periodStart"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isRecurring ? "First period starts" : "Start date"}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <SubmitButton pendingText="Saving…">{isEdit ? "Save changes" : "Create goal"}</SubmitButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
