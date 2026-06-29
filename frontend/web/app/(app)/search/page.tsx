import { Suspense } from "react";
import { PageHeader } from "@/components/common/page-header";
import { SearchView, type SearchInitial } from "@/components/search/search-view";
import { Skeleton } from "@/components/ui/skeleton";

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Search" description="Find any transaction by text, account, category, date, or amount." />
      <Suspense fallback={<SearchSkeleton />}>
        <SearchContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// searchParams is request data — awaiting it must happen inside <Suspense> under
// cacheComponents so the static shell (header) can prerender immediately.
async function SearchContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const initial: SearchInitial = {
    q: first(sp.q),
    categoryId: first(sp.categoryId),
    accountId: first(sp.accountId),
    from: first(sp.from),
    to: first(sp.to),
    minAmount: first(sp.minAmount),
    maxAmount: first(sp.maxAmount),
    limit: first(sp.limit) ? Number(first(sp.limit)) : 25,
    page: first(sp.page) ? Number(first(sp.page)) : 1,
  };

  return <SearchView initial={initial} />;
}

function SearchSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
