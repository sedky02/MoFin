"use client";

import { DatePicker } from "@/components/common/date-picker";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  ChevronRight,
  Info,
  Plus,
  TrendingDown,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/common/submit-button";
import { MoneyInput } from "@/components/common/money-input";
import { AccountSelect } from "@/components/transactions/account-select";
import { CategoryGlyph } from "@/components/categories/category-glyph";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { categoryScope, writableAccounts } from "@/lib/account-sharing";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useCreateGoal, useUpdateGoal } from "@/hooks/useGoals";
import { formatPeriodDate, parseMoneyInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatTargetAmount, goalAllCategoriesLabel, goalRuleHint } from "@/lib/goal-scope";
import type { Goal, GoalType } from "@/lib/types";

const INTENTS: {
  type: GoalType;
  label: string;
  hint: string;
  Icon: LucideIcon;
  tint: string;
}[] = [
  {
    type: "BALANCE",
    label: "Save up",
    hint: "Grow an account to an amount",
    Icon: Plus,
    tint: "text-primary-text",
  },
  {
    type: "INCOME",
    label: "Earn more",
    hint: "Reach an income target",
    Icon: TrendingUp,
    tint: "text-chart-2",
  },
  {
    type: "EXPENSE",
    label: "Spend less",
    hint: "Stay under a spending limit",
    Icon: TrendingDown,
    tint: "text-warning",
  },
];

/** What each field asks for, in the words of the chosen goal. */
const LABELS: Record<GoalType, { amount: string; category?: string; account: string; until: string }> = {
  EXPENSE: {
    amount: "Spending limit",
    category: "Spending category",
    account: "Account you pay from",
    until: "Last day",
  },
  INCOME: {
    amount: "Income target",
    category: "Income category",
    account: "Account you're paid into",
    until: "Last day",
  },
  BALANCE: { amount: "Amount to save", account: "Account you save in", until: "Reach it by" },
};

const CATEGORY_RULE = "Transfers don't count. A split transaction counts only its part in this category.";

const ALL_CATEGORIES = "all";

type Cadence = "MONTH" | "YEAR" | "ONCE";
const CADENCE_LABEL: Record<Cadence, string> = {
  MONTH: "Every month",
  YEAR: "Every year",
  ONCE: "Just once",
};
const CADENCE_PHRASE: Record<Cadence, string> = { MONTH: " a month", YEAR: " a year", ONCE: "" };

const schema = z
  .object({
    type: z.enum(["BALANCE", "INCOME", "EXPENSE"]),
    accountId: z.string().min(1, "Select an account."),
    categoryId: z.string(),
    targetAmount: z.string().refine((v) => !!parseMoneyInput(v), "Enter a valid amount."),
    cadence: z.enum(["MONTH", "YEAR", "ONCE"]),
    periodStart: z.string().min(1, "Start date is required."),
    periodEnd: z.string().optional(),
    name: z.string().trim().min(1, "Name is required.").max(60),
  })
  .superRefine((value, ctx) => {
    if (value.cadence === "ONCE" && !value.periodEnd) {
      ctx.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "Pick the last day of the goal.",
      });
    }
    // The end date counts in full, so a one-day goal (start = end) is fine.
    if (value.cadence === "ONCE" && value.periodEnd && value.periodEnd < value.periodStart) {
      ctx.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "End date can't be before the start date.",
      });
    }
  });
type Values = z.infer<typeof schema>;

const today = () => new Date().toISOString().slice(0, 10);

const DEFAULTS: Values = {
  type: "EXPENSE",
  accountId: "",
  categoryId: ALL_CATEGORIES,
  targetAmount: "",
  cadence: "MONTH",
  periodStart: today(),
  periodEnd: "",
  name: "",
};

/** The goal said in one line from what was picked: "Spend under $300 a month on Restaurants". */
function suggestedName(
  type: GoalType,
  cadence: Cadence,
  amount: string | null,
  currency: string | undefined,
  categoryName?: string,
  accountName?: string,
): string {
  const money = amount ? formatTargetAmount(amount, currency ?? "USD") : null;
  const every = CADENCE_PHRASE[cadence];
  if (type === "EXPENSE") {
    const on = categoryName ? ` on ${categoryName}` : "";
    return money ? `Spend under ${money}${every}${on}` : `Spending limit${on}`;
  }
  if (type === "INCOME") {
    const from = categoryName ? ` from ${categoryName}` : "";
    return money ? `Earn ${money}${every}${from}` : categoryName ? `Income from ${categoryName}` : "Income target";
  }
  const into = accountName ? ` in ${accountName}` : "";
  return money ? `Save ${money}${into}` : `Savings${into}`;
}

function goalCadence(goal: Goal): Cadence {
  if (!goal.isRecurring) return "ONCE";
  return goal.recurrenceUnit === "YEAR" ? "YEAR" : "MONTH";
}

function RuleTip({ text, label }: { text: string; label: string }) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-8"
        >
          <Info className="size-4" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-left">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

/** A field label, with an optional tip beside it. */
function Word({
  children,
  tip,
  tipLabel = "What counts",
}: {
  children: React.ReactNode;
  tip?: string;
  tipLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <FormLabel className="text-sm font-semibold">{children}</FormLabel>
      {tip && <RuleTip text={tip} label={tipLabel} />}
    </div>
  );
}

/** A frozen part of a goal being edited: shown as plain text, not a disabled input. */
function LockedValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold">{label}</p>
      <p className="flex items-center gap-2 text-[15px] text-muted-foreground">{children}</p>
    </div>
  );
}

export function GoalDialog({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: Goal; // present → edit mode (amount and name only; the rest is frozen once created)
}) {
  const isEdit = !!goal;
  const { data: allAccounts } = useAccounts();
  const accounts = writableAccounts(allAccounts ?? []);
  const { accountId: activeAccountId } = useActiveAccount();
  const createMut = useCreateGoal();
  const updateMut = useUpdateGoal();

  const [step, setStep] = React.useState<"intent" | "details">(isEdit ? "details" : "intent");
  const [editingStart, setEditingStart] = React.useState(false);
  const nameTouched = React.useRef(false);
  const amountRef = React.useRef<HTMLDivElement>(null);
  const firstIntentRef = React.useRef<HTMLButtonElement>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  });

  React.useEffect(() => {
    if (!open) return;
    setStep(goal ? "details" : "intent");
    setEditingStart(false);
    nameTouched.current = !!goal;
    const fallbackAccount = accounts.some((a) => a.id === activeAccountId) ? activeAccountId : accounts[0]?.id;
    form.reset(
      goal
        ? {
            type: goal.type,
            accountId: goal.accountId,
            categoryId: goal.categoryId ?? ALL_CATEGORIES,
            targetAmount: goal.targetAmount,
            cadence: goalCadence(goal),
            periodStart: goal.periodStart.slice(0, 10),
            periodEnd: goal.periodEnd?.slice(0, 10) ?? "",
            name: goal.name,
          }
        : {
            ...DEFAULTS,
            periodStart: today(),
            accountId: fallbackAccount ?? "",
          },
    );
    // Re-runs only when the dialog opens/changes goal, not when the account list refetches mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal, form]);

  const type = form.watch("type");
  const accountId = form.watch("accountId");
  const categoryId = form.watch("categoryId");
  const cadence = form.watch("cadence");
  const periodStart = form.watch("periodStart");
  const targetAmount = form.watch("targetAmount");

  const account = accounts.find((a) => a.id === accountId) ?? allAccounts?.find((a) => a.id === accountId);
  const { data: categories } = useCategories("active", open && type !== "BALANCE", categoryScope(account));
  const typeCategories = (categories ?? []).filter((c) => c.type === type);
  const chosenCategory =
    typeCategories.find((c) => c.id === categoryId) ?? (goal?.categoryId === categoryId ? goal.category : undefined);
  const words = LABELS[type];
  const intent = INTENTS.find((i) => i.type === type)!;

  React.useEffect(() => {
    if (!open || nameTouched.current) return;
    form.setValue(
      "name",
      suggestedName(
        type,
        cadence,
        parseMoneyInput(targetAmount ?? ""),
        account?.currency,
        chosenCategory?.name,
        account?.name,
      ),
    );
  }, [open, type, cadence, targetAmount, account?.currency, account?.name, chosenCategory?.name, form]);

  // A category belongs to one ledger, so moving to an account with another owner drops the pick.
  React.useEffect(() => {
    if (isEdit || categoryId === ALL_CATEGORIES || !categories) return;
    if (!typeCategories.some((c) => c.id === categoryId)) form.setValue("categoryId", ALL_CATEGORIES);
  }, [isEdit, categoryId, categories, typeCategories, form]);

  React.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      if (step === "intent") firstIntentRef.current?.focus();
      else amountRef.current?.querySelector("input")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, step]);

  function chooseIntent(next: GoalType) {
    form.setValue("type", next);
    if (next === "BALANCE") form.setValue("categoryId", ALL_CATEGORIES);
    setStep("details");
  }

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
        const recurring = values.cadence !== "ONCE";
        await createMut.mutateAsync({
          accountId: values.accountId,
          name: values.name,
          type: values.type,
          categoryId: values.type === "BALANCE" || values.categoryId === ALL_CATEGORIES ? null : values.categoryId,
          targetAmount: values.targetAmount,
          isRecurring: recurring,
          recurrenceUnit: recurring ? (values.cadence as "MONTH" | "YEAR") : undefined,
          periodStart: values.periodStart,
          periodEnd: recurring ? undefined : values.periodEnd,
        });
      }
      onOpenChange(false);
    } catch {
      // handled by hook's onError toast
    }
  }

  const categoryLabel = (
    <span className="flex items-center gap-2">
      {chosenCategory ? (
        <CategoryGlyph
          category={chosenCategory as { name: string; icon?: string | null }}
          className="size-4"
          style={chosenCategory.color ? { color: chosenCategory.color } : undefined}
        />
      ) : (
        <span aria-hidden className="size-2 rounded-full bg-muted-foreground/60" />
      )}
      {chosenCategory?.name ?? goalAllCategoriesLabel(type)}
    </span>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-[20px] p-0 sm:max-w-[440px]"
        showCloseButton={false}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="flex-row items-center gap-2 space-y-0 border-b px-4 py-2.5 sm:px-5 sm:py-3">
          {step === "details" && !isEdit && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-ml-2 shrink-0 text-muted-foreground"
              onClick={() => setStep("intent")}
            >
              <ArrowLeft aria-hidden />
              <span className="sr-only">Back to goal types</span>
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[15px]">
              {step === "intent" ? "New goal" : isEdit ? `Edit · ${intent.label}` : intent.label}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {step === "intent"
                ? "Choose what the goal is for."
                : isEdit
                  ? "Update this goal's amount or name."
                  : "Set the amount, what it counts and how often it repeats."}
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="-mr-2 shrink-0 text-muted-foreground">
              <X aria-hidden />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </DialogHeader>

        {step === "intent" ? (
          <div className="overflow-y-auto p-5 sm:p-6">
            <h3 className="mb-4 text-xl font-semibold tracking-tight">What&apos;s this goal for?</h3>
            <ul className="space-y-2.5">
              {INTENTS.map(({ type: value, label, hint, Icon, tint }, index) => (
                <li key={value}>
                  <button
                    ref={index === 0 ? firstIntentRef : undefined}
                    type="button"
                    onClick={() => chooseIntent(value)}
                    className="flex w-full items-center gap-3.5 rounded-[14px] border border-border p-4 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                      <Icon className={cn("size-5", tint)} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{label}</span>
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">{hint}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Form {...form}>
            <form action={action} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-[18px] overflow-y-auto p-5 sm:p-6">
                <FormField
                  control={form.control}
                  name="targetAmount"
                  render={({ field }) => (
                    <FormItem className="gap-1.5">
                      <Word>{words.amount}</Word>
                      <div ref={amountRef}>
                        <FormControl>
                          <MoneyInput
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            currency={account?.currency}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {words.category &&
                  (isEdit ? (
                    <LockedValue label={words.category}>{categoryLabel}</LockedValue>
                  ) : (
                    <FormField
                      control={form.control}
                      name="categoryId"
                      render={({ field }) => (
                        <FormItem className="gap-1.5">
                          <Word tip={CATEGORY_RULE}>{words.category}</Word>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="h-11 w-full">
                                <SelectValue>{categoryLabel}</SelectValue>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={ALL_CATEGORIES}>
                                <span className="flex items-center gap-2">
                                  <span aria-hidden className="size-2 rounded-full bg-muted-foreground/60" />
                                  {goalAllCategoriesLabel(type)}
                                </span>
                              </SelectItem>
                              {typeCategories.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  <span className="flex items-center gap-2">
                                    <CategoryGlyph
                                      category={c}
                                      className="size-4"
                                      style={c.color ? { color: c.color } : undefined}
                                    />
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
                  ))}

                {isEdit ? (
                  <LockedValue label={words.account}>{account?.name ?? "Account"}</LockedValue>
                ) : (
                  <FormField
                    control={form.control}
                    name="accountId"
                    render={({ field }) => (
                      <FormItem className="gap-1.5">
                        <Word tip={type === "BALANCE" ? goalRuleHint("BALANCE") : undefined}>{words.account}</Word>
                        <FormControl>
                          <AccountSelect
                            accounts={accounts}
                            value={field.value}
                            onChange={field.onChange}
                            className="h-11"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {isEdit ? (
                  <LockedValue label={cadence === "ONCE" ? words.until : "Repeats"}>
                    {cadence === "ONCE"
                      ? goal.periodEnd
                        ? formatPeriodDate(goal.periodEnd)
                        : "—"
                      : CADENCE_LABEL[cadence]}
                  </LockedValue>
                ) : (
                  <div className="space-y-2">
                    <FormField
                      control={form.control}
                      name="cadence"
                      render={({ field }) => (
                        <FormItem className="gap-1.5">
                          <Word>Repeats</Word>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="h-11 w-full">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(Object.keys(CADENCE_LABEL) as Cadence[]).map((value) => (
                                <SelectItem key={value} value={value}>
                                  {CADENCE_LABEL[value]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {cadence === "ONCE" && (
                      <FormField
                        control={form.control}
                        name="periodEnd"
                        render={({ field }) => (
                          <FormItem className="gap-1.5 pt-2">
                            <Word>{words.until}</Word>
                            <FormControl>
                              <DatePicker className="h-11" value={field.value} onChange={field.onChange} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {editingStart ? (
                      <FormField
                        control={form.control}
                        name="periodStart"
                        render={({ field }) => (
                          <FormItem className="gap-1.5 pt-2">
                            <FormLabel className="text-sm font-medium">
                              {cadence === "ONCE" ? "Starts on" : "First period starts"}
                            </FormLabel>
                            <FormControl>
                              <DatePicker className="h-11" value={field.value} onChange={field.onChange} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <p className="text-[13px] text-muted-foreground">
                        Starts {periodStart ? formatPeriodDate(`${periodStart}T00:00:00Z`) : "today"} ·{" "}
                        <button
                          type="button"
                          onClick={() => setEditingStart(true)}
                          className="font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Change
                        </button>
                      </p>
                    )}
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="gap-1.5 border-t pt-[18px]">
                      <Word
                        tip={isEdit ? undefined : "Written for you from the choices above. Type to change it."}
                        tipLabel="About the goal name"
                      >
                        Goal name
                      </Word>
                      <FormControl>
                        <Input
                          autoComplete="off"
                          placeholder="Name this goal"
                          className="h-11"
                          {...field}
                          onChange={(event) => {
                            // Clearing the name hands it back to the automatic one.
                            nameTouched.current = event.target.value.trim() !== "";
                            field.onChange(event);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t px-4 py-3 sm:px-5">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <SubmitButton pendingText="Saving…">{isEdit ? "Save changes" : "Create goal"}</SubmitButton>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
