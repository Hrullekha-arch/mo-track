"use client";

import { InventoryItem, StockTableClient } from "./StockTableClient";

export function StockTable({
  initialData,
  lastDocId,
  totalCount,
}: {
  initialData: InventoryItem[];
  lastDocId: string | null;
  totalCount: number;
}) {
  return (
    <StockTableClient
      initialData={initialData}
      initialLastDocId={lastDocId}
      totalCount={totalCount}
    />
  );
}
