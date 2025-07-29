
import { OrdersTable } from "@/components/features/order-management/OrdersTable";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrdersPage() {
    return (
        <Suspense fallback={<OrdersDashboardSkeleton />}>
            <OrdersTable />
        </Suspense>
    );
}


function OrdersDashboardSkeleton() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
                <div>
                <Skeleton className="h-9 w-48 mb-2" />
                <Skeleton className="h-5 w-72" />
                </div>
                <Skeleton className="h-10 w-32" />
            </header>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 mb-6">
                {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
                ))}
            </div>
            <div className="mb-6 p-4 border rounded-lg bg-card">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                </div>
            </div>
            <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
                <Skeleton className="h-[450px] w-full" />
                <Skeleton className="h-[450px] w-full" />
            </div>
        </div>
    )
}
