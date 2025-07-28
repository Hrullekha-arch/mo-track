
import { PurchaseRequestTable } from "@/components/features/purchase/PurchaseRequestTable";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function InventoryPage() {
    return (
        <div className="w-full p-4 md:p-6 lg:p-8">
             <Suspense fallback={<InventorySkeleton />}>
                <PurchaseRequestTable view="all" />
            </Suspense>
        </div>
    );
}

function InventorySkeleton() {
    return (
        <>
            <header className="mb-8">
                <Skeleton className="h-9 w-1/2 mb-2" />
                <Skeleton className="h-5 w-3/4" />
            </header>
            <Card>
                <CardContent className="p-4">
                     <div className="flex items-center py-4 gap-4">
                        <Skeleton className="h-10 max-w-sm flex-1" />
                        <Skeleton className="h-10 w-24" />
                        <Skeleton className="h-10 w-24" />
                     </div>
                      <Skeleton className="h-[400px] w-full" />
                </CardContent>
            </Card>
        </>
    )
}
