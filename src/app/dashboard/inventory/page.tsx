

import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StockTable } from "@/components/features/inventory/StockTable";
import { getStockData } from "./actions";
import { Stock } from "@/lib/types";
import { StockManagement } from "@/components/features/inventory/StockManagement";
import { StockHistoryTable } from "@/components/features/inventory/StockHistoryTable";
import { StockDetails } from "@/components/features/inventory/StockDetails";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import { TaxDetails } from "@/components/features/inventory/TaxDetails";


export default async function InventoryPage() {
    const stockData: Stock[] = await getStockData();
    const totalStock = stockData.length;

    return (
        <div className="w-full p-4 md:p-6 lg:p-8 space-y-4">
             <header className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
                    <p className="text-muted-foreground">
                        View and manage your stock. Total Items: <span className="font-bold text-foreground">{totalStock.toLocaleString()}</span>
                    </p>
                </div>
                <Button asChild>
                    <Link href="/dashboard/inventory/scan">
                        <ScanLine className="mr-2 h-4 w-4" />
                        Scan Stock
                    </Link>
                </Button>
            </header>
            <Tabs defaultValue="stock" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="stock">Stock List</TabsTrigger>
                    <TabsTrigger value="stock-management">Stock Management</TabsTrigger>
                    <TabsTrigger value="stock-details">Stock Details</TabsTrigger>
                    <TabsTrigger value="tax-details">Tax Details</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
                <TabsContent value="stock">
                    <Suspense fallback={<InventorySkeleton />}>
                        <StockTable initialData={stockData} />
                    </Suspense>
                </TabsContent>
                <TabsContent value="stock-management">
                     <Suspense fallback={<InventorySkeleton />}>
                        <StockManagement />
                    </Suspense>
                </TabsContent>
                <TabsContent value="stock-details">
                     <Suspense fallback={<InventorySkeleton />}>
                        <StockDetails />
                    </Suspense>
                </TabsContent>
                <TabsContent value="tax-details">
                    <Suspense fallback={<InventorySkeleton />}>
                        <TaxDetails />
                    </Suspense>
                </TabsContent>
                 <TabsContent value="history">
                     <Suspense fallback={<InventorySkeleton />}>
                        <StockHistoryTable />
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
