
import { Stock } from "@/lib/types";
import { StockTableClient } from "./StockTableClient";

interface StockTableProps {
  initialData: Stock[];
}

export function StockTable({ initialData }: StockTableProps) {
  return <StockTableClient initialData={initialData} />;
}
