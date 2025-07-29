
"use client";

import { Stock } from "@/lib/types";
import { StockTableClient } from "./StockTableClient";

export function StockTable({ initialData }: { initialData: Stock[] }) {
  // Data is now passed directly as a prop from the server component.
  // No client-side fetching is needed here.
  return <StockTableClient initialData={initialData} />;
}
