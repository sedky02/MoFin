import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading placeholders shaped like the real content they stand in for, so nothing jumps when it arrives.

/** Transactions grouped under a day heading, each row like TransactionRow: tile, two lines, amount. */
export function TransactionDaysSkeleton({ days = [3, 2] }: { days?: number[] }) {
  return (
    <div className="space-y-6" aria-hidden>
      {days.map((rows, d) => (
        <section key={d}>
          <Skeleton className="mb-2 ml-1 h-4 w-32" />
          <Card className="gap-0 overflow-hidden border-0 p-0 shadow-sm">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                <Skeleton className="size-11 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-40 max-w-[60%]" />
                  <Skeleton className="h-3 w-28 max-w-[45%]" />
                </div>
                <Skeleton className="h-4 w-20 shrink-0" />
              </div>
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

/** The search bar and filter row above the transaction list. */
export function TransactionFiltersSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <Skeleton className="h-9 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Skeleton className="h-9 rounded-lg" />
        <Skeleton className="h-9 rounded-lg" />
        <Skeleton className="col-span-2 h-9 rounded-lg lg:col-span-1" />
      </div>
    </div>
  );
}

/** Goal groups of two-zone cards: name and badges left, figure right, bar underneath. */
export function GoalCardsSkeleton() {
  return (
    <div className="space-y-10" aria-hidden>
      {[2, 1].map((cards, g) => (
        <section key={g}>
          <Skeleton className="mb-3 ml-1 h-4 w-32" />
          <div className="space-y-3">
            {Array.from({ length: cards }).map((_, i) => (
              <div key={i} className="rounded-card bg-card p-5 shadow-surface sm:p-6">
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0 flex-1 space-y-3">
                    <Skeleton className="h-5 w-40" />
                    <div className="flex flex-wrap gap-2">
                      <Skeleton className="h-6 w-20 rounded-full" />
                      <Skeleton className="h-6 w-24 rounded-full" />
                      <Skeleton className="h-6 w-28 rounded-full" />
                    </div>
                  </div>
                  <div className="hidden flex-col items-end gap-2 sm:flex">
                    <Skeleton className="h-7 w-32" />
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="mt-6 h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Draft cards: label, quoted text, the parsed line with its amount, then the actions. */
export function DraftCardsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="gap-0 border-0 p-4 shadow-sm">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-1.5 h-3 w-24" />
          <div className="mt-4 flex items-center gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="ml-auto h-5 w-20" />
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Account groups like the Accounts page: a "Bank · 1" heading, then cards with icon, name and balance. */
export function AccountGroupsSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      {[2, 1].map((cards, g) => (
        <section key={g}>
          <div className="mb-3 flex items-center gap-3 px-1">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-3 w-3" />
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: cards }).map((_, i) => (
              <Card key={i} className="gap-5 border-0 p-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                  <div className="flex gap-1.5">
                    <Skeleton className="size-6 rounded-md" />
                    <Skeleton className="size-6 rounded-md" />
                    <Skeleton className="size-6 rounded-md" />
                  </div>
                </div>
                <Skeleton className="h-8 w-40" />
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The category search box, then Expenses and Income cards with a count and icon rows. */
export function CategoryListsSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <Skeleton className="h-9 w-full rounded-lg sm:w-72" />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {[5, 3].map((rows, i) => (
          <Card key={i} className="gap-0 border-0 py-0">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-4" />
            </div>
            <div className="pb-1">
              {Array.from({ length: rows }).map((_, j) => (
                <div key={j} className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-0">
                  <Skeleton className="size-10 rounded-xl" />
                  <Skeleton className="h-4 w-32" />
                  <div className="ml-auto flex gap-1.5">
                    <Skeleton className="size-7 rounded-md" />
                    <Skeleton className="size-7 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
