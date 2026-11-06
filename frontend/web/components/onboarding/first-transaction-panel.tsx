import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const WAYS = [
  { href: "/transactions/new", icon: Plus, title: "Record a transaction", text: "Amount, category and account.", primary: true },
  { href: "/drafts", icon: Sparkles, title: "Describe it in words", text: "“lunch 12.50”, reviewed before it's saved.", primary: false },
] as const;

/**
 * Shown in place of the balance chart while nothing is recorded: a chart of nothing says nothing,
 * so it names the one next step and offers its two ways in as equal choices.
 */
export function FirstTransactionPanel() {
  return (
    <div>
      <h2 className="text-base font-semibold">Record your first transaction</h2>
      <p className="mt-1 text-sm text-muted-foreground">Your balance, charts and goals fill in from here.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {WAYS.map(({ href, icon: Icon, title, text, primary }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "group flex items-center gap-3.5 rounded-xl p-4 outline-none transition-[background-color,box-shadow,filter] focus-visible:ring-2 focus-visible:ring-ring",
              primary
                ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary-text/70 hover:brightness-95 dark:ring-transparent"
                : "bg-card ring-1 ring-foreground/40 hover:bg-muted/60 hover:ring-foreground/60 dark:bg-muted dark:ring-border dark:hover:bg-accent dark:hover:ring-border",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl",
                primary ? "bg-white/50 text-primary-foreground dark:bg-black/10" : "bg-primary/15 text-primary-text",
              )}
            >
              <Icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{title}</span>
              <span className={cn("block text-sm", primary ? "text-primary-foreground/85" : "text-muted-foreground")}>{text}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
