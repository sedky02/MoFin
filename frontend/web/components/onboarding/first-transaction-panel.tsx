import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const WAYS = [
  { href: "/transactions/new", icon: Plus, title: "Record a transaction", text: "Amount, category and account.", primary: true },
  { href: "/drafts", icon: Sparkles, title: "Describe it in words", text: "“lunch 12.50”, reviewed before it's saved.", primary: false },
] as const;

/**
 * What the balance card shows in place of its chart while nothing is recorded: a chart of
 * nothing says nothing, so the space names the one next step and offers its two ways in as
 * equal, full-size choices. The lime one is the plain route; the other is the AI one.
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
                ? "bg-primary text-primary-foreground shadow-sm hover:brightness-95"
                : "bg-muted/40 ring-1 ring-border hover:bg-muted/70 dark:bg-muted",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl",
                primary ? "bg-black/10" : "bg-primary/15 text-primary-text",
              )}
            >
              <Icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{title}</span>
              <span className={cn("block text-sm", primary ? "text-primary-foreground/80" : "text-muted-foreground")}>{text}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
