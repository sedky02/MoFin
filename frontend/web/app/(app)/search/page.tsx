import { PageHeader } from "@/components/common/page-header";
import { SearchView, type SearchInitial } from "@/components/search/search-view";

//export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// Next.js 16: searchParams is a Promise — await it for the initial filter values.
export default async function SearchPage({
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

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Search" description="Find any transaction by text, account, category, date, or amount." />
      <SearchView initial={initial} />
    </div>
  );
}
