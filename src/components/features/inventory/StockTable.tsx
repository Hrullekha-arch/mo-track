
"use client";

import { Stock } from "@/lib/types";
import { StockTableClient } from "./StockTableClient";
import { useEffect, useState } from "react";
import { getStockData } from "@/app/dashboard/inventory/actions";
import { Skeleton } from "@/components/ui/skeleton";

export function StockTable() {
  const [initialData, setInitialData] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const data = await getStockData();
      setInitialData(data);
      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) {
    return (
       <div className="space-y-4">
            <div className="flex items-center py-4 gap-4">
                <Skeleton className="h-10 max-w-sm flex-1" />
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-24" />
            </div>
            <Skeleton className="h-[400px] w-full" />
        </div>
    );
  }

  return <StockTableClient initialData={initialData} />;
}
