"use client";

import { formatPeriodDate, normalizeMoneyTyping } from "@/lib/format";
import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search as SearchIcon, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { SkeletonRows, EmptyState, ErrorState } from "@/components/common/states";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useSearchPage, type SearchParams } from "@/hooks/useSearch";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { transactionAccountLabel } from "@/lib/transaction-accounts";
import { groupByDay } from "@/lib/transaction-days";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SORT,
  RECURRENCE_OPTIONS,
  SORT_OPTIONS,
  TYPE_OPTIONS,
  accountOptionLabel,
  parseRecurrence,
  parseSort,
  parseType,
} from "@/lib/transaction-list-params";

const ALL = "__all__";

export interface SearchInitial extends SearchParams {
  page?: number;
}

export function SearchView({ initial, active = true }: { initial: SearchInitial; active?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  // Archived accounts too: their history is still filterable, and rows name them.
  const { data: accounts } = useAccounts("all");
  const { data: categories } = useCategories();

  const [q, setQ] = React.useState(initial.q ?? "");
  const [categoryId, setCategoryId] = React.useState(initial.categoryId ?? "");
  const [accountId, setAccountId] = React.useState(initial.accountId ?? "");
  const [from, setFrom] = React.useState(initial.from ?? "");
  const [to, setTo] = React.useState(initial.to ?? "");
  const [minAmount, setMinAmount] = React.useState(initial.minAmount ?? "");
  const [maxAmount, setMaxAmount] = React.useState(initial.maxAmount ?? "");
  const [type, setType] = React.useState(initial.type ?? "");
  const [recurrence, setRecurrence] = React.useState(initial.recurrence ?? "");
  const [sort, setSort] = React.useState(initial.sort ?? DEFAULT_SORT);
  const [limit, setLimit] = React.useState(initial.limit ?? 25);
  const [page, setPage] = React.useState(initial.page ?? 1);

  const debouncedQ = useDebouncedValue(q, 350);
  // The fields keep what was typed; the query gets the dot-decimal reading
  // ("1,234" -> 1234, "12,5" -> 12.5), or nothing while it can't be read.
  const debouncedMin = useDebouncedValue(normalizeMoneyTyping(minAmount) ?? "", 350);
  const debouncedMax = useDebouncedValue(normalizeMoneyTyping(maxAmount) ?? "", 350);

  const filters: SearchParams = {
    q: debouncedQ || undefined,
    categoryId: categoryId || undefined,
    accountId: accountId || undefined,
    from: from || undefined,
    to: to || undefined,
    minAmount: debouncedMin || undefined,
    maxAmount: debouncedMax || undefined,
    type: parseType(type),
    recurrence: parseRecurrence(recurrence),
    sort: sort === DEFAULT_SORT ? undefined : sort,
    limit,
  };

  const hasFilters =
    !!debouncedQ ||
    !!categoryId ||
    !!accountId ||
    !!from ||
    !!to ||
    !!debouncedMin ||
    !!debouncedMax ||
    !!type ||
    !!recurrence;
  // A non-default sort order is something to undo too, so it counts for "Clear all" and gets a chip.
  const hasActive = hasFilters || sort !== DEFAULT_SORT;

  // The filters behind "More filters", counted for the button that opens them. Search, account and
  // category sit in the toolbar. The two ends of a range are one filter, and so is a non-default sort.
  const panelFilterCount = [type, recurrence, from || to, minAmount || maxAmount, sort !== DEFAULT_SORT].filter(
    Boolean,
  ).length;
  // Closed by default so the list is the first thing you see, but open when the URL already carries filters.
  const [filtersOpen, setFiltersOpen] = React.useState(panelFilterCount > 0);

  // Reset to page 1 whenever a filter changes.
  // Skipped on mount so a ?page=3 URL (refresh, Back) isn't snapped to page 1.
  const filterKey = [
    debouncedQ,
    categoryId,
    accountId,
    from,
    to,
    debouncedMin,
    debouncedMax,
    type,
    recurrence,
    sort,
    limit,
  ].join("|");
  const prevFilterKey = React.useRef(filterKey);
  React.useEffect(() => {
    if (prevFilterKey.current === filterKey) return;
    prevFilterKey.current = filterKey;
    setPage(1);
  }, [filterKey]);

  // Sync filters → URL so refresh / share / back works.
  // Paused while the list is hidden, so it doesn't overwrite another view's URL.
  React.useEffect(() => {
    if (!active) return;
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (categoryId) params.set("categoryId", categoryId);
    if (accountId) params.set("accountId", accountId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (debouncedMin) params.set("minAmount", debouncedMin);
    if (debouncedMax) params.set("maxAmount", debouncedMax);
    if (type) params.set("type", type);
    if (recurrence) params.set("recurrence", recurrence);
    if (sort !== DEFAULT_SORT) params.set("sort", sort);
    if (limit !== 25) params.set("limit", String(limit));
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [
    debouncedQ,
    categoryId,
    accountId,
    from,
    to,
    debouncedMin,
    debouncedMax,
    type,
    recurrence,
    sort,
    limit,
    page,
    pathname,
    router,
    active,
  ]);

  const { data, isLoading, isFetching, isError, refetch } = useSearchPage(
    filters,
    page,
    limit,
  );

  function clearFilters() {
    setQ("");
    setCategoryId("");
    setAccountId("");
    setFrom("");
    setTo("");
    setMinAmount("");
    setMaxAmount("");
    setType("");
    setRecurrence("");
    setSort(DEFAULT_SORT);
    setPage(1);
  }

  const rows = data?.rows ?? [];
  // Newest-first and oldest-first lists read by day; the others (amount, next occurrence) don't.
  const byDay = sort === "newest" || sort === "oldest";
  const accountsById = accounts ? new Map(accounts.map((a) => [a.id, a])) : undefined;

  // Every active filter as a chip that removes itself.
  const chips: { key: string; label: string; clear: () => void }[] = [];
  const account = accounts?.find((a) => a.id === accountId);
  if (accountId) chips.push({ key: "account", label: account ? accountOptionLabel(account) : "Account", clear: () => setAccountId("") });
  const category = categories?.find((c) => c.id === categoryId);
  if (categoryId) chips.push({ key: "category", label: category?.name ?? "Category", clear: () => setCategoryId("") });
  const typeLabel = TYPE_OPTIONS.find((o) => o.value === type)?.label;
  if (typeLabel) chips.push({ key: "type", label: typeLabel, clear: () => setType("") });
  const recurrenceLabel = RECURRENCE_OPTIONS.find((o) => o.value === recurrence)?.label;
  if (recurrenceLabel) chips.push({ key: "recurrence", label: recurrenceLabel, clear: () => setRecurrence("") });
  if (from || to) {
    chips.push({
      key: "dates",
      label:
        from && to
          ? `${formatPeriodDate(from)} – ${formatPeriodDate(to)}`
          : from
            ? `From ${formatPeriodDate(from)}`
            : `Until ${formatPeriodDate(to)}`,
      clear: () => {
        setFrom("");
        setTo("");
      },
    });
  }
  if (minAmount || maxAmount) {
    chips.push({
      key: "amount",
      label:
        minAmount && maxAmount
          ? `Amount ${minAmount} – ${maxAmount}`
          : minAmount
            ? `At least ${minAmount}`
            : `At most ${maxAmount}`,
      clear: () => {
        setMinAmount("");
        setMaxAmount("");
      },
    });
  }
  if (sort !== DEFAULT_SORT) {
    chips.push({ key: "sort", label: SORT_OPTIONS.find((o) => o.value === sort)?.label ?? sort, clear: () => setSort(DEFAULT_SORT) });
  }

  const first = (page - 1) * limit + 1;
  const last = (page - 1) * limit + rows.length;

  return (
    <div className="space-y-5">
      {/* The common filters are always in reach: search, account and category, then the rest behind one button. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="relative col-span-2 lg:col-span-1">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search descriptions…"
            className="bg-card pl-9 dark:bg-input/30"
            aria-label="Search transactions"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              aria-label="Clear search text"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <Select value={accountId || ALL} onValueChange={(v) => setAccountId(v === ALL ? "" : v)}>
          <SelectTrigger className="w-full bg-card" aria-label="Account">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All accounts</SelectItem>
            {(accounts ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {accountOptionLabel(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryId || ALL} onValueChange={(v) => setCategoryId(v === ALL ? "" : v)}>
          <SelectTrigger className="w-full bg-card" aria-label="Category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {(categories ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          aria-expanded={filtersOpen}
          aria-controls="transaction-filters"
          onClick={() => setFiltersOpen((open) => !open)}
          // The page is off-white, so the controls on it are white (bg-card), like the cards below.
          className="col-span-2 shrink-0 gap-2 bg-card lg:col-span-1"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          More filters
          {panelFilterCount > 0 && (
            <span
              className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold tabular text-primary-foreground"
              aria-label={`${panelFilterCount} active`}
            >
              {panelFilterCount}
            </span>
          )}
          <ChevronDown className={cn("size-3.5 transition-transform", filtersOpen && "rotate-180")} aria-hidden />
        </Button>
      </div>

      {filtersOpen && (
        <Card id="transaction-filters" className="border-0 p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Field label="Type">
              <Select value={type || ALL} onValueChange={(v) => setType(v === ALL ? "" : (parseType(v) ?? ""))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Recurring">
              <Select
                value={recurrence || ALL}
                onValueChange={(v) => setRecurrence(v === ALL ? "" : (parseRecurrence(v) ?? ""))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Recurring and one-off" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Recurring and one-off</SelectItem>
                  {RECURRENCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="col-span-2 lg:col-span-1">
              <Field label="Sort by">
                <Select value={sort} onValueChange={(v) => setSort(parseSort(v) ?? DEFAULT_SORT)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="From date">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="tabular" />
            </Field>
            <Field label="To date">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="tabular" />
            </Field>
            <div className="col-span-2 grid grid-cols-2 gap-2 lg:col-span-1">
              <Field label="Min amount">
                <Input
                  inputMode="decimal"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  placeholder="0"
                  className="tabular"
                />
              </Field>
              <Field label="Max amount">
                <Input
                  inputMode="decimal"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  placeholder="∞"
                  className="tabular"
                />
              </Field>
            </div>
          </div>
        </Card>
      )}

      {/* What is filtering the list right now, each one a click from gone. */}
      {hasActive && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters" role="group">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.clear}
              aria-label={`Remove filter: ${chip.label}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
            >
              {chip.label}
              <X className="size-3 text-muted-foreground" aria-hidden />
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-sm px-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <SkeletonRows rows={6} />
      ) : isError ? (
        <ErrorState description="Couldn't load transactions." onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title={hasActive ? "No transactions match" : "No transactions yet"}
          description={
            hasActive
              ? "Try widening your filters or clearing them."
              : "Record a transaction to see it here."
          }
          action={
            hasActive ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {byDay ? (
            // Sorted by date: each day is a heading, then one panel of that day's rows.
            <div className="space-y-6">
              {groupByDay(rows, new Date()).map((group) => (
                <section key={group.key} aria-label={group.label}>
                  <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">{group.label}</h2>
                  <Card className="overflow-hidden border-0 p-0 shadow-sm">
                    {group.rows.map((tx) => (
                      <TransactionRow
                        key={tx.id}
                        tx={tx}
                        variant="glance"
                        accountLabel={transactionAccountLabel(tx, accountsById)}
                      />
                    ))}
                  </Card>
                </section>
              ))}
            </div>
          ) : (
            // Sorted by amount or by next occurrence, the days jump around, so each row keeps its own date.
            <Card className="overflow-hidden border-0 p-0 shadow-sm">
              <div className="divide-y divide-border">
                {rows.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} accountLabel={transactionAccountLabel(tx, accountsById)} />
                ))}
              </div>
            </Card>
          )}

          {/* Count and paging, with how many to show per page */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                <SelectTrigger size="sm" className="bg-card tabular" aria-label="Per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50].map((n) => (
                    <SelectItem key={n} value={String(n)} className="tabular">
                      {n} per page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p role="status" className="text-xs text-muted-foreground tabular">
                {data ? (first === last ? `${first} of ${data.total}` : `${first}–${last} of ${data.total}`) : `Page ${page}`}
                {isFetching && ", updating…"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="bg-card"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-card"
                disabled={!data?.hasNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactElement<{ id?: string; children?: React.ReactNode }> }) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      {withControlId(children, id)}
    </div>
  );
}

/**
 * Puts the label's id on the focusable control. A Select's root renders nothing,
 * so for a Select it goes on the trigger, or the dropdown would have no name.
 */
function withControlId(control: React.ReactElement<{ id?: string; children?: React.ReactNode }>, id: string) {
  if (control.type !== Select) return React.cloneElement(control, { id });
  return React.cloneElement(
    control,
    {},
    React.Children.map(control.props.children, (child) =>
      React.isValidElement<{ id?: string }>(child) && child.type === SelectTrigger ? React.cloneElement(child, { id }) : child,
    ),
  );
}
