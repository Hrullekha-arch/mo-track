"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  RefreshCw,
  Tag,
  Building,
  Warehouse,
  Ruler,
  Layers,
  BadgePercent,
  ChevronRight,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  searchStockByBcn,
  getStockTransactions,
  getStockById,
} from "@/app/dashboard/inventory/actions";

/** ✅ Updated Inventory Types (match new fields) */
type InventoryItem = {
  id?: string;
  bcn: string;
  itemName?: string;

  categoryGroup?: string;
  category?: string;
  unit?: string;
  type?: string;
  width?: number;

  moCollection?: string;
  moCollectionCode?: string;

  maxlevel?: number;
  closingstock?: number;

  supplierCompanyName?: string;
  supplierCollectionName?: string;
  supplierCollectionCode?: string;

  composition?: string;
  martindale?: number;
  weightGsm?: number;

  horizontalRepeatCms?: number;
  verticalRepeatCms?: number;

  costPriceRs?: number;
  costMultiplierRs?: number;
  rrpWithGstRs?: number;
};

type StockTransaction = {
  id: string;
  createdAt: string;
  type?: string; // "addition" | "deduction" | etc (keep flexible)
  quantityChange: number;
  orderId?: string;
  poNumber?: string;
  salesman?: string;
  status?: string;
  note?: string;
};

const money = (v: any) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
};

const num = (v: any) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN");
};
const CutHistoryView = ({ history }: { history: StockTransaction[] | undefined }) => {
    if (!history || history.length === 0) {
        return <p className="text-xs text-muted-foreground px-4 py-2">No cuts from this roll.</p>;
    }
    return (
        <div className="p-2 bg-muted/50">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="h-8 text-xs">Date</TableHead>
                        <TableHead className="h-8 text-xs text-right">Qty Cut</TableHead>
                        <TableHead className="h-8 text-xs">Order ID</TableHead>
                        <TableHead className="h-8 text-xs">Salesman</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {history.map(cut => (
                        <TableRow key={cut.id}>
                            <TableCell className="py-1 text-xs">{format(new Date(cut.createdAt), 'dd/MM/yy')}</TableCell>
                            <TableCell className="py-1 text-xs text-right font-mono text-destructive">{Math.abs(cut.quantityChange).toFixed(2)}</TableCell>
                            <TableCell className="py-1 text-xs">{cut.orderId}</TableCell>
                            <TableCell className="py-1 text-xs">{cut.salesman}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
};

export function StockManagement() {
  const [bcnOptions, setBcnOptions] = React.useState<ComboboxOption[]>([]);
  const [selectedStock, setSelectedStock] = React.useState<InventoryItem | null>(
    null
  );
  const [transactions, setTransactions] = React.useState<StockTransaction[]>(
    []
  );

  const [isSearching, setIsSearching] = React.useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const { toast } = useToast();

  const handleBcnSearch = async (query: string) => {
    if (query.length < 2) {
      setBcnOptions([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = (await searchStockByBcn(query)) as any[];

      const options = results.map((stock) => {
        const cs = Number(stock.closingstock ?? stock.availableQty ?? 0);
        return {
          value: stock.bcn, // ✅ use BCN as unique selection key
          label: `${stock.bcn} - ${stock.itemName || "Unnamed"} (${Number.isFinite(
            cs
          )
            ? cs
            : 0
          })`,
          stockItem: stock,
        };
      });

      setBcnOptions(options as any);
    } catch (error) {
      console.error("Error searching BCN:", error);
      toast({ variant: "destructive", title: "Search failed" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectStock = React.useCallback(
    async (stockItem: InventoryItem) => {
      setSelectedStock(stockItem);
      setIsLoadingDetails(true);
      try {
        const stockDocId = stockItem.id || stockItem.bcn;
        const tx = (await getStockTransactions(stockDocId)) as any[];
        setTransactions(tx || []);
      } catch (error) {
        toast({ variant: "destructive", title: "Error fetching details" });
        setTransactions([]);
      } finally {
        setIsLoadingDetails(false);
      }
    },
    [toast]
  );

  const handleRefresh = async () => {
    if (!selectedStock) return;
    setIsRefreshing(true);
    try {
      const stockDocId = selectedStock.id || selectedStock.bcn;
      const freshStock = (await getStockById(stockDocId)) as any;
      if (freshStock) {
        await handleSelectStock(freshStock);
        toast({ title: "Data refreshed" });
      } else {
        toast({
          variant: "destructive",
          title: "Refresh Failed",
          description: "Could not find the stock item.",
        });
        setSelectedStock(null);
        setTransactions([]);
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Refresh Failed" });
    } finally {
      setIsRefreshing(false);
    }
  };

  const lowStock =
    selectedStock &&
    Number.isFinite(Number(selectedStock.closingstock)) &&
    Number.isFinite(Number(selectedStock.maxlevel)) &&
    Number(selectedStock.maxlevel) > 0 &&
    Number(selectedStock.closingstock) <= Number(selectedStock.maxlevel);

  const stockAddedTransactions = transactions.filter(
    (t) => (t.type || "").toLowerCase() === "addition"
  );
  const stockSoldTransactions = transactions.filter(
    (t) => (t.type || "").toLowerCase() === "deduction"
  );

  console.log("Selected Stock:", selectedStock);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock Management</CardTitle>
        <CardDescription>
          Select an item to view its details and transaction history.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex items-end gap-4">
          <div className="w-full max-w-sm space-y-2">
            <Label htmlFor="search-stock">Search Stock</Label>
            <Combobox
              options={bcnOptions}
              value={selectedStock?.bcn}
              onSelect={(value) => {
                const selectedOption = bcnOptions.find(
                  (opt) => opt.value === value
                ) as any;
                if (selectedOption) {
                  handleSelectStock(selectedOption.stockItem);
                }
              }}
              placeholder="Search by BCN or Item Name..."
              searchPlaceholder="Type to search..."
              emptyPlaceholder={isSearching ? "Searching..." : "No stock found."}
              onSearch={handleBcnSearch}
            />
          </div>
        </div>

        {selectedStock && (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-semibold">
                      {selectedStock.itemName || "Unnamed Item"}
                    </p>
                    {lowStock ? (
                      <Badge variant="destructive">Low Stock</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    BCN: <span className="font-medium">{selectedStock.bcn}</span>
                  </p>
                </div>

                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  {isRefreshing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </div>

              <Separator className="my-4" />

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Closing Stock
                  </strong>
                  <span className={cn(lowStock && "text-red-600 font-semibold")}>
                    {num(selectedStock.closingstock)}
                  </span>
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Max Level
                  </strong>
                  {num(selectedStock.maxlevel)}
                </p>

                <p className="text-sm flex items-center gap-1">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  <strong className="text-muted-foreground">Category:</strong>{" "}
                  {selectedStock.category || "—"}
                </p>

                <p className="text-sm flex items-center gap-1">
                  <Layers className="h-3 w-3 text-muted-foreground" />
                  <strong className="text-muted-foreground">Group:</strong>{" "}
                  {selectedStock.categoryGroup || "—"}
                </p>

                <p className="text-sm flex items-center gap-1">
                  <Ruler className="h-3 w-3 text-muted-foreground" />
                  <strong className="text-muted-foreground">Width:</strong>{" "}
                  {num(selectedStock.width)}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">Unit</strong>
                  {selectedStock.unit || "—"}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">Type</strong>
                  {selectedStock.type || "—"}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    MO Collection
                  </strong>
                  {selectedStock.moCollection || "—"}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    MO Collection Code
                  </strong>
                  {selectedStock.moCollectionCode || "—"}
                </p>

                <p className="text-sm flex items-center gap-1">
                  <Building className="h-3 w-3 text-muted-foreground" />
                  <strong className="text-muted-foreground">Supplier:</strong>{" "}
                  {selectedStock.supplierCompanyName || "—"}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Supplier Collection Name
                  </strong>
                  {selectedStock.supplierCollectionName || "—"}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Supplier Collection Code
                  </strong>
                  {selectedStock.supplierCollectionCode || "—"}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Composition
                  </strong>
                  {selectedStock.composition || "—"}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Martindale
                  </strong>
                  {num(selectedStock.martindale)}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Weight (GSM)
                  </strong>
                  {num(selectedStock.weightGsm)}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    H Repeat (cms)
                  </strong>
                  {num(selectedStock.horizontalRepeatCms)}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    V Repeat (cms)
                  </strong>
                  {num(selectedStock.verticalRepeatCms)}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Cost Price
                  </strong>
                  {money(selectedStock.costPriceRs)}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    Cost Multiplier
                  </strong>
                  {num(selectedStock.costMultiplierRs)}
                </p>

                <p className="text-sm">
                  <strong className="block text-muted-foreground">
                    RRP with GST
                  </strong>
                  {money(selectedStock.rrpWithGstRs)}
                </p>
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
                    <div className="border rounded-lg bg-white shadow-md overflow-hidden">
                        <h3 className="font-semibold mb-2 text-center p-4 bg-gray-200">Stock Deducted (Sold/Cut)</h3>
                        <div className="max-h-60 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Qty</TableHead>
                                        <TableHead>Order ID</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingDetails ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center">
                                                <Loader2 className="h-6 w-6 animate-spin" />
                                            </TableCell>
                                        </TableRow>
                                    ) : stockSoldTransactions.length > 0 ? (
                                        stockSoldTransactions.map(tx => (
                                            <TableRow key={tx.id} className="hover:bg-gray-100 transition-colors">
                                                <TableCell>{new Date(tx.createdAt).toLocaleDateString()}</TableCell>
                                                <TableCell className="font-mono">{Math.abs(tx.quantityChange).toFixed(2)}</TableCell>
                                                <TableCell>{tx.orderId}</TableCell>
                                                <TableCell>
                                                    <Badge variant={tx.status === 'cut' ? 'default' : 'secondary'} className={cn(tx.status === 'cut' && 'bg-green-600')}>
                                                        {tx.status || 'pending for cutting'}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center">
                                                No sold data available.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                    
                    <div className="border rounded-lg bg-white shadow-md overflow-hidden">
                        <h3 className="font-semibold mb-2 text-center p-4 bg-gray-200">Stock Added (Purchase Rolls)</h3>
                        <div className="max-h-60 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Full Length</TableHead>
                                        <TableHead>Available</TableHead>
                                        <TableHead>Reserved</TableHead>
                                        <TableHead>PO</TableHead>
                                        <TableHead>Salesman</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingDetails ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                <Loader2 className="h-6 w-6 animate-spin" />
                                            </TableCell>
                                        </TableRow>
                                    ) : stockAddedTransactions.length > 0 ? (
                                        stockAddedTransactions.map(tx => (
                                            <React.Fragment key={tx.id}>
                                                <Collapsible asChild>
                                                    <>
                                                        <TableRow className="hover:bg-gray-100 transition-colors">
                                                            <TableCell className="font-semibold">
                                                                <div className="flex items-center gap-2">
                                                                    <CollapsibleTrigger asChild>
                                                                        <Button variant="ghost" size="icon" className="h-6 w-6">
                                                                            <ChevronRight className="h-4 w-4 transition-transform data-[state=open]:rotate-90" />
                                                                        </Button>
                                                                    </CollapsibleTrigger>
                                                                    <span>{`${(tx as any).quantity.toFixed(2)} Mtr`}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="font-semibold text-green-600">{`${(tx as any).availableQty.toFixed(2)}`}</TableCell>
                                                            <TableCell className="font-semibold text-destructive">{`${(tx as any).reservedQty.toFixed(2)}`}</TableCell>
                                                            <TableCell>{tx.poNumber || 'N/A'}</TableCell>
                                                            <TableCell>{tx.salesman || 'N/A'}</TableCell>
                                                        </TableRow>
                                                        <CollapsibleContent asChild>
                                                            <TableRow>
                                                                <TableCell colSpan={5} className="p-0">
                                                                    <CutHistoryView history={(tx as any).cutHistory} />
                                                                </TableCell>
                                                            </TableRow>
                                                        </CollapsibleContent>
                                                    </>
                                                </Collapsible>
                                            </React.Fragment>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                No purchase data available.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
