import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-24" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-[52px] w-full" />
        <Skeleton className="h-[52px] w-full" />
        <Skeleton className="h-[52px] w-full" />
      </div>
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
