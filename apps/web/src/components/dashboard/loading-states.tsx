import { cn } from "@cartwright/ui/lib/utils";

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted/60", className)} />;
}

export function KPICardSkeleton() {
  return (
    <div className="p-4 sm:p-5 flex flex-col justify-between space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-20" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-b sm:border-b-0 sm:border-r border-border/60 last:border-0">
            <KPICardSkeleton />
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-[280px] rounded-xl" />
        <Skeleton className="h-[280px] rounded-xl" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <Skeleton className="h-5 w-40" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TabSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-b sm:border-b-0 sm:border-r border-border/60 last:border-0">
            <KPICardSkeleton />
          </div>
        ))}
      </div>
      <Skeleton className="h-[300px] rounded-xl" />
    </div>
  );
}
