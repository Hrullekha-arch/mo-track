

"use client";

import { Stock } from "@/lib/types";
import { StockTableClient } from "./StockTableClient";

export function StockTable({ initialData }: { initialData: Stock[] }) {
  return <StockTableClient initialData={initialData} />;
}
