import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container mx-auto space-y-4 p-3 md:p-4 lg:p-5">
      <Card className="overflow-hidden border-slate-200">
        <CardContent className="space-y-4 p-5 md:p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-5 w-full max-w-3xl" />
          <div className="flex flex-wrap gap-3 pt-2">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-10 w-52" />
            <Skeleton className="h-10 w-56" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>

      <Card className="border-slate-200">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:justify-between">
            <Skeleton className="h-10 w-56" />
            <div className="flex gap-3">
              <Skeleton className="h-10 w-44" />
              <Skeleton className="h-10 w-72" />
            </div>
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[420px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
