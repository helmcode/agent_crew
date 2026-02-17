interface LoadingSkeletonProps {
  count?: number;
}

export function LoadingSkeleton({ count = 3 }: LoadingSkeletonProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-lg border border-slate-700 bg-slate-800/50 p-6">
          <div className="mb-3 h-5 w-2/3 rounded bg-slate-700" />
          <div className="mb-4 h-4 w-full rounded bg-slate-700/60" />
          <div className="flex items-center gap-2">
            <div className="h-5 w-16 rounded-full bg-slate-700" />
            <div className="h-4 w-20 rounded bg-slate-700/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
