import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StockTable } from "@/components/features/inventory/StockTable";
import { Stock } from "@/lib/types";
import { StockManagementV2 } from "@/components/features/inventory/StockManagementV2";
import { StockHistoryTable } from "@/components/features/inventory/StockHistoryTable";
import { StockDetails } from "@/components/features/inventory/StockDetails";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import { TaxDetails } from "@/components/features/inventory/TaxDetails";
import { getStockPaginated } from "@/lib/server/stock";

export default async function InventoryPage() {
  const { items, lastDocId, totalCount } =
    await getStockPaginated();

  return (
    <div className="w-full p-4 md:p-6 lg:p-8 space-y-4">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground">
            View and manage your stock. Total Items:{" "}
            {/* <span className="font-bold text-foreground">
              {totalStock.toLocaleString()}
            </span> */}
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
            <StockTable
            initialData={items}
            lastDocId={lastDocId}
            totalCount={totalCount}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="stock-management">
          <StockManagementV2 />
        </TabsContent>

        <TabsContent value="stock-details">
          <StockDetails />
        </TabsContent>

        <TabsContent value="tax-details">
          <TaxDetails />
        </TabsContent>

        <TabsContent value="history">
          <StockHistoryTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InventorySkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <Skeleton className="h-10 w-1/2 mb-4" />
        <Skeleton className="h-[400px] w-full" />
      </CardContent>
    </Card>
  );
}
