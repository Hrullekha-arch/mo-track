
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Stock, StockTransaction } from "@/lib/types";
import { searchStockByBcn, getStockTransactions, getStockById } from "@/app/dashboard/inventory/actions";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle, RefreshCw, Trash2, Tag, Warehouse, BadgePercent, Building } from "lucide-react";
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
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                 {isLoadingDetails ? (
                                    <TableRow><TableCell colSpan={3} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin" /></TableCell></TableRow>
                                ) : stockSoldTransactions.length > 0 ? (
                                    stockSoldTransactions.map(tx => (
                                        <TableRow key={tx.id}>
                                            <TableCell>{new Date(tx.createdAt).toLocaleDateString()}</TableCell>
                                            <TableCell>{Math.abs(tx.quantityChange).toFixed(2)}</TableCell>
                                            <TableCell>{tx.orderId}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">
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
                                    <TableHead>Date</TableHead>
                                    <TableHead>Roll Length</TableHead>
                                    <TableHead>Available Qty</TableHead>
                                    <TableHead>Reserved Qty</TableHead>
                                    <TableHead>Salesman</TableHead>
                                    <TableHead>PO Number</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoadingDetails ? (
                                    <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin" /></TableCell></TableRow> 
                                ) : stockAddedTransactions.length > 0 ? (
                                    stockAddedTransactions.map(tx => (
                                         <TableRow key={tx.id}>
                                            <TableCell>{new Date(tx.createdAt).toLocaleDateString()}</TableCell>
                                            <TableCell>{`${(tx as any).quantity.toFixed(2)} Mtr`}</TableCell>
                                            <TableCell className="font-semibold text-green-600">{`${(tx as any).availableQty.toFixed(2)} Mtr`}</TableCell>
                                            <TableCell className="font-semibold text-destructive">{`${(tx as any).reservedQty.toFixed(2)} Mtr`}</TableCell>
                                            <TableCell>{tx.salesman || 'N/A'}</TableCell>
                                            <TableCell>{tx.poNumber || 'N/A'}</TableCell>
                                         </TableRow>
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
