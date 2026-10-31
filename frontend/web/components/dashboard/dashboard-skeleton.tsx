import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the real layout (hero + goals, then summary + transactions) so nothing jumps
// when the streamed content arrives: same grid, same radii, comparable heights.
export function DashboardSkeleton() {
  return (
    <>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-72" />
      </div>

      <section className="space-y-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Skeleton className="h-104 w-full rounded-hero lg:col-span-8" />
          <Skeleton className="h-104 w-full rounded-card lg:col-span-4" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-136 w-full rounded-card" />
          <Skeleton className="h-136 w-full rounded-card" />
        </div>
      </section>
    </>
  );
}
