"use client";

import Link from "next/link";
import { Check, ChevronRight, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FirstAccountForm } from "@/components/onboarding/first-account-form";
import type { SetupState } from "@/hooks/useSetup";
import { SETUP_STEPS } from "@/lib/onboarding";
import type { Account } from "@/lib/types";
import { cn } from "@/lib/utils";

type StepState = Extract<SetupState, { status: "step" }>;

/**
 * Every step sits in the same frame (step bar, title, line, card), so moving on changes only what's
 * inside.
 */
export function Setup({ step, accounts, skip, name }: Pick<StepState, "step" | "accounts" | "skip"> & { name?: string }) {
  const index = SETUP_STEPS.indexOf(step);
  const first = name?.trim().split(/\s+/)[0];

  return (
    <section aria-labelledby="setup-title" className="mx-auto w-full max-w-xl">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium tabular text-muted-foreground">
            Step {index + 1} of {SETUP_STEPS.length}
          </p>
          <div aria-hidden className="flex flex-1 gap-1.5">
            {SETUP_STEPS.map((id, i) => (
              <span
                key={id}
                className={cn("h-1 flex-1 rounded-full transition-colors duration-500", i <= index ? "bg-primary" : "bg-secondary")}
              />
            ))}
          </div>
        </div>
        <h1 id="setup-title" className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-[-0.022em] sm:text-[2rem]">
          {step === "account" ? "Add your first account" : "Record your first transaction"}
        </h1>
        <p className="mt-2 text-[0.9375rem] text-muted-foreground">
          {step === "account"
            ? `Welcome to MoFin${first ? `, ${first}` : ""}. Start with the account you use most.`
            : "Log something you spent or earned, and your balance and charts start to move."}
        </p>
      </header>

      <Card className="gap-0 border-0 p-5 sm:p-6">
        {step === "account" ? <FirstAccountForm /> : <FirstTransaction accounts={accounts} />}
      </Card>

      {step === "transaction" && (
        <div className="mt-3 text-center">
          <Button variant="ghost" className="text-muted-foreground" onClick={skip}>
            Skip for now
          </Button>
        </div>
      )}
    </section>
  );
}

const WAYS = [
  { href: "/transactions/new", icon: Plus, title: "Add a transaction", text: "Pick the amount, category and account." },
  { href: "/drafts", icon: Sparkles, title: "Describe it in words", text: "Write “lunch 12.50” and review the draft before it's saved." },
] as const;

function recap(accounts: Account[]): string {
  const [only] = accounts;
  return accounts.length === 1 ? `${only.name} (${only.currency}) is ready.` : `${accounts.length} accounts are ready.`;
}

function FirstTransaction({ accounts }: { accounts: Account[] }) {
  return (
    <>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span aria-hidden className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" strokeWidth={3} />
        </span>
        {recap(accounts)}
      </p>
      <ul className="-mx-2 mt-3 divide-y divide-border">
        {WAYS.map(({ href, icon: Icon, title, text }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex items-center gap-3.5 rounded-xl px-2 py-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-text">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-sm text-muted-foreground">{text}</span>
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
