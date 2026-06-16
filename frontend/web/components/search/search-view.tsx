"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search as SearchIcon, X, SlidersHorizontal } from "lucide-react";
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

const ALL = "__all__";

export interface SearchInitial extends SearchParams {
  page?: number;
}

export function SearchView({ initial }: { initial: SearchInitial }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();

  const [q, setQ] = React.useState(initial.q ?? "");
  const [categoryId, setCategoryId] = React.useState(initial.categoryId ?? "");
  const [accountId, setAccountId] = React.useState(initial.accountId ?? "");
  const [from, setFrom] = React.useState(initial.from ?? "");
  const [to, setTo] = React.useState(initial.to ?? "");
  const [minAmount, setMinAmount] = React.useState(initial.minAmount ?? "");
  const [maxAmount, setMaxAmount] = React.useState(initial.maxAmount ?? "");
  const [limit, setLimit] = React.useState(initial.limit ?? 25);
  const [page, setPage] = React.useState(initial.page ?? 1);

  const debouncedQ = useDebouncedValue(q, 350);
  const debouncedMin = useDebouncedValue(minAmount, 350);
  const debouncedMax = useDebouncedValue(maxAmount, 350);

  const filters: SearchParams = {
    q: debouncedQ || undefined,
    categoryId: categoryId || undefined,
    accountId: accountId || undefined,
    from: from || undefined,
    to: to || undefined,
    minAmount: debouncedMin || undefined,
    maxAmount: debouncedMax || undefined,
    limit,
  };

  const hasFilters =
    !!debouncedQ ||
    !!categoryId ||
    !!accountId ||
    !!from ||
    !!to ||
    !!debouncedMin ||
    !!debouncedMax;

  // Reset to page 1 whenever a filter changes.
  React.useEffect(() => {
    setPage(1);
  }, [debouncedQ, categoryId, accountId, from, to, debouncedMin, debouncedMax, limit]);

  // Sync filters → URL so refresh / share / back works.
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (categoryId) params.set("categoryId", categoryId);
    if (accountId) params.set("accountId", accountId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (debouncedMin) params.set("minAmount", debouncedMin);
    if (debouncedMax) params.set("maxAmount", debouncedMax);
    if (limit !== 25) params.set("limit", String(limit));
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [debouncedQ, categoryId, accountId, from, to, debouncedMin, debouncedMax, limit, page, pathname, router]);

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
    setLimit(25);
    setPage(1);
  }

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-5">
      {/* Search bar */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search descriptions…"
          className="pl-9"
          aria-label="Search transactions"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search text"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Filters */}
      <Card className="border-0 p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <SlidersHorizontal className="size-4" />
          Filters
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 gap-1 text-xs"
              onClick={clearFilters}
            >
              <X className="size-3.5" />
              Clear all
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Account">
            <Select
              value={accountId || ALL}
              onValueChange={(v) => setAccountId(v === ALL ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All accounts</SelectItem>
                {(accounts ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Category">
            <Select
              value={categoryId || ALL}
              onValueChange={(v) => setCategoryId(v === ALL ? "" : v)}
            >
              <SelectTrigger className="w-full">
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
          </Field>

          <Field label="Per page">
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger className="w-full tabular">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50].map((n) => (
                  <SelectItem key={n} value={String(n)} className="tabular">
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="From date">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="tabular" />
          </Field>
          <Field label="To date">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="tabular" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Min amount">
              <Input
                inputMode="decimal"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0"
                className="tabular"
              />
            </Field>
            <Field label="Max amount">
              <Input
                inputMode="decimal"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="∞"
                className="tabular"
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* Results */}
      {isLoading ? (
        <SkeletonRows rows={6} />
      ) : isError ? (
        <ErrorState description="Search failed." onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="No matching transactions"
          description={
            hasFilters
              ? "Try widening your filters or clearing them."
              : "Record a transaction to see it here."
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Card className="overflow-hidden border-0 p-0 shadow-sm">
            <div className="divide-y divide-border">
              {rows.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </div>
          </Card>

          {/* Page-number pagination */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground tabular">
              Page {page}
              {isFetching && " · updating…"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
