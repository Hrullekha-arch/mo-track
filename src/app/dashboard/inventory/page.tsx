
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StockTable } from "@/components/features/inventory/StockTable";
import { getStockData } from "./actions";


export default async function InventoryPage() {
    const initialStock = await getStockData();

    return (
        <div className="w-full p-4 md:p-6 lg:p-8 space-y-4">
             <header>
                <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
                <p className="text-muted-foreground">View and manage your stock.</p>
            </header>
            <Tabs defaultValue="stock" className="w-full">
                <TabsList>
                    <TabsTrigger value="stock">Stock</TabsTrigger>
                </TabsList>
                <TabsContent value="stock">
                    <Suspense fallback={<InventorySkeleton />}>
                        <StockTable initialData={initialStock} />
                    </Suspense>
                </TabsContent>
            </Tabs>
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
