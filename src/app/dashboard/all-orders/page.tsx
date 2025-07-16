
import { AllOrdersTable } from "@/components/features/order-management/AllOrdersTable";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function AllOrdersPage() {

    return (
        <Suspense fallback={<AllOrdersSkeleton />}>
            <AllOrdersTable />
        </Suspense>
    );
}


function AllOrdersSkeleton() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
             <div className="flex items-center justify-between mb-8">
                <div>
                    <Skeleton className="h-9 w-64 mb-2" />
                    <Skeleton className="h-5 w-96" />
                </div>
            </div>
            <Card>
                <CardHeader>
                    <Skeleton className="h-7 w-48 mb-2" />
                    <Skeleton className="h-5 w-80" />
                </CardHeader>
                <CardContent>
                     <Skeleton className="h-[400px] w-full" />
                </CardContent>
            </Card>
        </div>
    )
}
