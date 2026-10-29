"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PiggyBank, TrendingDown, TrendingUp, X, type LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogClose,
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
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useCreateGoal, useUpdateGoal } from "@/hooks/useGoals";
import { parseMoneyInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { goalRuleHint, goalScopeLabel } from "@/lib/goal-scope";
import type { Goal, GoalType } from "@/lib/types";

const GOAL_TYPES: { value: GoalType; label: string; hint: string; Icon: LucideIcon }[] = [
  { value: "BALANCE", label: "Balance", hint: "Save up", Icon: PiggyBank },
  { value: "INCOME", label: "Income", hint: "Earn more", Icon: TrendingUp },
  { value: "EXPENSE", label: "Expense", hint: "Spend less", Icon: TrendingDown },
];

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
    // The end date counts in full, so a one-day goal (start = end) is fine.
    if (!value.isRecurring && value.periodEnd && value.periodEnd < value.periodStart) {
      ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "End date can't be before the start date." });
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
  const { accountId: activeAccountId } = useActiveAccount();
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
        : { ...DEFAULTS, accountId: activeAccountId ?? "" },
    );
    // Re-runs only when the dialog opens/changes goal, not when the active account changes mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal, form]);

  const isRecurring = form.watch("isRecurring");
  const watchedType = form.watch("type");
  const watchedAccountId = form.watch("accountId");
  const scopeAccount = accounts?.find((a) => a.id === watchedAccountId);

  async function action() {
    const valid = await form.trigger(undefined, { shouldFocus: true });
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
      <DialogContent
        // Header and footer stay put; only the form body scrolls, so a short screen never clips the buttons.
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        showCloseButton={false}
        // The name is the first thing to fill in, so the cursor starts there, not on the close button.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          form.setFocus("name");
        }}
      >
        <DialogHeader className="flex-row items-center gap-3 border-b px-4 py-2.5 sm:px-6 sm:py-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base">{isEdit ? "Edit goal" : "New goal"}</DialogTitle>
            {/* Kept for screen readers; the title says it. */}
            <DialogDescription className="sr-only">
              {isEdit
                ? "Update this goal's name or target amount."
                : "Set a balance, income or expense target for one of your accounts."}
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground">
              <X aria-hidden />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </DialogHeader>

        <Form {...form}>
          <form action={action} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:space-y-5 sm:px-6 sm:py-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Emergency fund" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => {
                  const order = GOAL_TYPES.map((t) => t.value);
                  // Arrow keys move through the choices like a radio group, and only the chosen one is a tab stop.
                  const onKeyDown = (event: React.KeyboardEvent) => {
                    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
                    if (!step || isEdit) return;
                    event.preventDefault();
                    const next = order[(order.indexOf(field.value) + step + order.length) % order.length];
                    field.onChange(next);
                    document.getElementById(`goal-type-${next}`)?.focus();
                  };
                  return (
                    <FormItem>
                      <p id="goal-type-label" className="text-sm font-medium leading-none">
                        Goal type
                      </p>
                      <div
                        role="radiogroup"
                        aria-labelledby="goal-type-label"
                        aria-describedby="goal-type-hint"
                        onKeyDown={onKeyDown}
                        className="grid grid-cols-3 gap-2"
                      >
                        {GOAL_TYPES.map(({ value, label, hint, Icon }) => {
                          const selected = field.value === value;
                          return (
                            <button
                              key={value}
                              id={`goal-type-${value}`}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              tabIndex={selected ? 0 : -1}
                              disabled={isEdit}
                              onClick={() => field.onChange(value)}
                              className={cn(
                                "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                "disabled:cursor-not-allowed disabled:opacity-60",
                                selected
                                  ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                                  : "border-border hover:bg-secondary",
                              )}
                            >
                              <Icon
                                className={cn("size-4", selected ? "text-primary-text" : "text-muted-foreground")}
                                aria-hidden
                              />
                              <span className="text-sm font-medium">{label}</span>
                              <span className="w-full truncate text-xs text-muted-foreground">{hint}</span>
                            </button>
                          );
                        })}
                      </div>
                      {/* What the type counts and when it is judged: read out with the group, not shown. */}
                      <div id="goal-type-hint" className="sr-only">
                        <span className="block" data-testid="goal-scope">
                          {goalScopeLabel(watchedType, scopeAccount?.name)}
                        </span>
                        <span className="mt-1 block" data-testid="goal-rule">
                          {goalRuleHint(watchedType)}
                        </span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  );
                }}
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
                /* When it runs: only chosen when the goal is created, then fixed. */
                <div className="space-y-4 rounded-xl bg-muted/40 p-3 sm:p-4">
                  <FormField
                    control={form.control}
                    name="isRecurring"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-3">
                        <FormLabel>Recurring</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <div className="grid items-start gap-4 sm:grid-cols-2">
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
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="m-0 flex-row justify-end gap-2 px-4 py-3 sm:gap-2 sm:px-6 sm:py-4">
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
