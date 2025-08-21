
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Stock, StockTransaction } from "@/lib/types";
import { searchStockByBcn, getStockTransactions, getStockById } from "@/app/dashboard/inventory/actions";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle, RefreshCw, Trash2, Tag, Warehouse, BadgePercent, Building, ChevronDown, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const updateStockSchema = z.object({
    poNo: z.string().min(1, "PO Number is required."),
    lengths: z.array(z.object({ value: z.string().min(1, "Length must not be empty.") })).min(1, "At least one length is required."),
});

type UpdateStockFormValues = z.infer<typeof updateStockSchema>;


function UpdateStockDialog({ stock, onStockUpdated }: { stock: Stock, onStockUpdated: (newStock: Stock) => void }) {
    // This dialog is now complex because it needs to add a new `length` document.
    // This should probably be part of the import flow.
    // For now, this will be disabled pending a rethink of manual stock addition.
    return (
        <Button disabled>Update Stock (Disabled)</Button>
    )
}

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
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {history.map(cut => (
                        <TableRow key={cut.id}>
                            <TableCell className="py-1 text-xs">{format(new Date(cut.createdAt), 'dd/MM/yy')}</TableCell>
                            <TableCell className="py-1 text-xs text-right font-mono text-destructive">{Math.abs(cut.quantityChange).toFixed(2)}</TableCell>
                            <TableCell className="py-1 text-xs">{cut.orderId}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
};

export function StockManagement() {
  const [bcnOptions, setBcnOptions] = React.useState<ComboboxOption[]>([]);
  const [selectedStock, setSelectedStock] = React.useState<Stock | null>(null);
  const [transactions, setTransactions] = React.useState<StockTransaction[]>([]);
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
      const results = await searchStockByBcn(query);
      const options = results.map(stock => ({
        value: stock.id,
        label: `${stock.bcn} - ${stock.itemName} (${(stock.availableQty || 0).toFixed(2)} Mtr)`,
        stockItem: stock
      }));
      setBcnOptions(options as any);
    } catch (error) {
      console.error("Error searching BCN:", error);
      toast({ variant: 'destructive', title: 'Search failed' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectStock = React.useCallback(async (stockItem: Stock) => {
    setSelectedStock(stockItem);
    setIsLoadingDetails(true);
      try {
      const transactionsResult = await getStockTransactions(stockItem.bcn);
      setTransactions(transactionsResult);

    } catch (error) {
        toast({ variant: 'destructive', title: 'Error fetching details' });
    } finally {
      setIsLoadingDetails(false);
    }
  }, [toast]);
  
  const handleStockUpdated = (newStock: Stock) => {
      setSelectedStock(newStock);
      handleSelectStock(newStock);
  }

  const handleRefresh = async () => {
    if (!selectedStock) return;
    setIsRefreshing(true);
    try {
        const freshStock = await getStockById(selectedStock.bcn);
        if (freshStock) {
            await handleSelectStock(freshStock);
            toast({ title: 'Data refreshed' });
        } else {
            toast({ variant: 'destructive', title: 'Refresh Failed', description: 'Could not find the stock item.' });
            setSelectedStock(null);
            setTransactions([]);
        }
    } catch (error) {
        toast({ variant: 'destructive', title: 'Refresh Failed' });
    } finally {
        setIsRefreshing(false);
    }
  };
  
  const stockAddedTransactions = transactions.filter(t => t.type === 'addition');
  const stockSoldTransactions = transactions.filter(t => t.type === 'deduction');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock Management</CardTitle>
        <CardDescription>Select a stock item to view its transaction history and update quantities.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-end gap-4">
            <div className="w-full max-w-sm space-y-2">
                 <Label htmlFor="search-stock">Search Stock</Label>
                <Combobox
                    options={bcnOptions}
                    value={selectedStock?.id}
                    onSelect={(value) => {
                        const selectedOption = bcnOptions.find(opt => opt.value === value) as any;
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
                 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 items-center">
                    <p className="text-sm"><strong className="block text-muted-foreground">BCN:</strong> {selectedStock.bcn}</p>
                    <p className="text-sm col-span-2"><strong className="block text-muted-foreground">Item Name:</strong> {selectedStock.itemName}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">Original Qty:</strong> {(selectedStock.quantity || 0).toFixed(2)}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">Available Qty:</strong> {(selectedStock.availableQty || 0).toFixed(2)}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">Reserved Qty:</strong> {(selectedStock.reservedQty || 0).toFixed(2)}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">Cut Qty:</strong> {(selectedStock.cutQty || 0).toFixed(2)}</p>
                    <p className="text-sm flex items-center gap-1"><Tag className="h-3 w-3 text-muted-foreground" /><strong className="text-muted-foreground">Category:</strong> {selectedStock.category || 'N/A'}</p>
                    <p className="text-sm flex items-center gap-1"><BadgePercent className="h-3 w-3 text-muted-foreground" /><strong className="text-muted-foreground">HSN/Tax:</strong> {selectedStock.hsnCode || 'N/A'} / {selectedStock.tax || 0}%</p>
                    <p className="text-sm flex items-center gap-1"><Building className="h-3 w-3 text-muted-foreground" /><strong className="text-muted-foreground">Vendor:</strong> {selectedStock.vendorName || 'N/A'}</p>
                    <p className="text-sm flex items-center gap-1">₹<strong className="text-muted-foreground">MRP:</strong> {selectedStock.mrp || 0}</p>
                    <p className="text-sm flex items-center gap-1"><Warehouse className="h-3 w-3 text-muted-foreground" /><strong className="text-muted-foreground">Rack:</strong> {selectedStock.rack || 'N/A'}</p>
                 </div>
                 <Separator className="my-4" />
                 <div className="flex justify-end mt-4 gap-2">
                    <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
                        {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Refresh
                    </Button>
                    <UpdateStockDialog stock={selectedStock} onStockUpdated={handleStockUpdated} />
                 </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <h3 className="font-semibold mb-2 text-center">Stock Deducted (Sold/Cut)</h3>
                    <div className="border rounded-lg max-h-60 overflow-y-auto">
                         <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Qty</TableHead>
                                    <TableHead>Order ID</TableHead>
                                    <TableHead>Length ID</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                 {isLoadingDetails ? (
                                    <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin" /></TableCell></TableRow>
                                ) : stockSoldTransactions.length > 0 ? (
                                    stockSoldTransactions.map(tx => (
                                        <TableRow key={tx.id}>
                                            <TableCell>{new Date(tx.createdAt).toLocaleDateString()}</TableCell>
                                            <TableCell className="font-mono">{Math.abs(tx.quantityChange).toFixed(2)}</TableCell>
                                            <TableCell>{tx.orderId}</TableCell>
                                            <TableCell className="text-xs font-mono">{tx.lengthId || 'N/A'}</TableCell>
                                            <TableCell><Badge variant={tx.status === 'cut' ? 'default' : 'secondary'} className={cn(tx.status === 'cut' && 'bg-green-600')}>{tx.status || 'pending for cutting'}</Badge></TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            No sold data available.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
                 <div>
                    <h3 className="font-semibold mb-2 text-center">Stock Added (Purchase Rolls)</h3>
                     <div className="border rounded-lg max-h-60 overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10"></TableHead>
                                    <TableHead>Roll ID</TableHead>
                                    <TableHead>Roll Length</TableHead>
                                    <TableHead>Available</TableHead>
                                    <TableHead>Reserved</TableHead>
                                    <TableHead>PO</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoadingDetails ? (
                                    <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin" /></TableCell></TableRow> 
                                ) : stockAddedTransactions.length > 0 ? (
                                    stockAddedTransactions.map(tx => (
                                        <Collapsible key={tx.id} asChild>
                                          <React.Fragment>
                                            <TableRow>
                                                <TableCell>
                                                    <CollapsibleTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-6 w-6">
                                                            <ChevronRight className="h-4 w-4 transition-transform data-[state=open]:rotate-90" />
                                                        </Button>
                                                    </CollapsibleTrigger>
                                                </TableCell>
                                                <TableCell>{tx.id}</TableCell>
                                                <TableCell>{`${(tx as any).quantity.toFixed(2)} Mtr`}</TableCell>
                                                <TableCell className="font-semibold text-green-600">{`${(tx as any).availableQty.toFixed(2)}`}</TableCell>
                                                <TableCell className="font-semibold text-destructive">{`${(tx as any).reservedQty.toFixed(2)}`}</TableCell>
                                                <TableCell>{tx.poNumber || 'N/A'}</TableCell>
                                            </TableRow>
                                            <CollapsibleContent asChild>
                                                <TableRow>
                                                    <TableCell colSpan={6}>
                                                        <CutHistoryView history={(tx as any).cutHistory} />
                                                    </TableCell>
                                                </TableRow>
                                            </CollapsibleContent>
                                          </React.Fragment>
                                        </Collapsible>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
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
