import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-28" />
          <Skeleton className="h-11 w-20" />
        </div>
      </div>
      <Skeleton className="h-[52px] w-full sm:w-72" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-44" />
        <Skeleton className="h-40 sm:col-span-2" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
