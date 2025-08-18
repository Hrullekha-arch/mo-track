

"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Stock, StockTransaction } from "@/lib/types";
import { searchStockByBcn, updateStockQuantityAction, getStockTransactions, getStockById, getAvailableStockLengths } from "@/app/dashboard/inventory/actions";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle, RefreshCw, Trash2 } from "lucide-react";
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
    const [isOpen, setIsOpen] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const { toast } = useToast();
    const { user } = useAuth();
    
    const form = useForm<UpdateStockFormValues>({
        resolver: zodResolver(updateStockSchema),
        defaultValues: {
            poNo: "",
            lengths: [{ value: "" }],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "lengths",
    });

    const onSubmit = async (data: UpdateStockFormValues) => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Authentication Error' });
            return;
        }
        setIsSubmitting(true);
        try {
            const lengthsAsNumbers = data.lengths.map(l => parseFloat(l.value)).filter(n => !isNaN(n));
            const addedQuantity = lengthsAsNumbers.reduce((sum, length) => sum + length, 0);
            
            const transaction: Omit<StockTransaction, 'id'> = {
                stockId: stock.id,
                bcn: stock.bcn || '',
                type: 'addition',
                quantityChange: addedQuantity,
                poNumber: data.poNo,
                lengths: lengthsAsNumbers,
                createdAt: new Date().toISOString(),
                createdBy: user.name,
            };

            const result = await updateStockQuantityAction(stock.id, transaction);
            
            if (result.success && result.newStock) {
                toast({ title: 'Stock Updated!', description: `${addedQuantity} units added successfully.`});
                const freshStock = await getStockById(stock.id);
                if (freshStock) {
                    onStockUpdated(freshStock);
                }
                setIsOpen(false);
                form.reset();
            } else {
                toast({ variant: 'destructive', title: 'Update failed', description: result.message });
            }

        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'An unexpected error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button>Update Stock</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Update Stock for {stock.bcn}</DialogTitle>
                    <DialogDescription>Add new stock received via a Purchase Order.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                         <FormField
                            control={form.control}
                            name="poNo"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>PO NO</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter Purchase Order Number" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="space-y-2">
                             <FormLabel>Lengths</FormLabel>
                             {fields.map((field, index) => (
                                <div key={field.id} className="flex items-center gap-2">
                                     <FormField
                                        control={form.control}
                                        name={`lengths.${index}.value`}
                                        render={({ field }) => (
                                            <FormItem className="flex-grow">
                                                <FormControl>
                                                    <Input type="number" placeholder="Enter length" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                             ))}
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => append({ value: "" })}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add new Length
                        </Button>
                        <DialogFooter className="pt-4">
                            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Submit
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
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
        label: `${stock.bcn} - ${stock.itemName}`,
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
      const transactionsResult = await getStockTransactions(stockItem.id);
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
        const freshStock = await getStockById(selectedStock.id);
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

  const calculatedAvailableLengths = React.useMemo(() => {
    return stockAddedTransactions.map(addedTx => {
        // Find all 'cut' deductions for this specific roll (addedTx)
        const cutsMade = stockSoldTransactions.filter(
            soldTx => (soldTx as any).parentTransactionId === addedTx.id && soldTx.status === 'cut'
        );
        const totalCutQuantity = cutsMade.reduce((sum, cut) => sum + Math.abs(cut.quantityChange), 0);
        
        // Original length is the quantityChange on the 'addition' transaction
        const originalLength = addedTx.quantityChange;
        const availableLength = originalLength - totalCutQuantity;
        
        return {
            length: availableLength,
            transactionId: addedTx.id,
        };
    }).filter(l => l.length > 0.01); // Filter out tiny remnants
  }, [stockAddedTransactions, stockSoldTransactions]);


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
                    <p className="text-sm"><strong className="block text-muted-foreground">Sr No:</strong> {selectedStock.serialNo}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">Rack:</strong> {selectedStock.rack || 'N/A'}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">Current Stock Qty:</strong> {selectedStock.quantity}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">Vendor:</strong> {selectedStock.vendorName}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">Category:</strong> {selectedStock.category}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">MRP:</strong> ₹{selectedStock.mrp}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">Tax:</strong> {selectedStock.tax ?? 'N/A'}%</p>
                    <p className="text-sm col-span-2 md:col-span-1"><strong className="block text-muted-foreground">Last Updated:</strong> {new Date(selectedStock.lastUpdatedAt).toLocaleDateString()}</p>
                 </div>
                 <Separator className="my-4" />
                {isLoadingDetails ? <Loader2 className="h-4 w-4 animate-spin"/> : (
                    <div className="space-y-2">
                        <Label>Available Lengths</Label>
                        <div className="flex flex-wrap gap-2">
                            {calculatedAvailableLengths.length > 0 ? (
                                calculatedAvailableLengths.map((len, index) => <Badge key={index} variant="secondary">{len.length.toFixed(2)}</Badge>)
                            ) : (
                                <p className="text-xs text-muted-foreground">No specific lengths available or tracked.</p>
                            )}
                        </div>
                    </div>
                )}
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
                    <h3 className="font-semibold mb-2 text-center">Stock Sold</h3>
                    <div className="border rounded-lg">
                         <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Sold Length</TableHead>
                                    <TableHead>Last Length</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Order ID</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                 {isLoadingDetails ? (
                                    <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin" /></TableCell></TableRow>
                                ) : stockSoldTransactions.length > 0 ? (
                                    stockSoldTransactions.map(tx => (
                                        <TableRow key={tx.id}>
                                            <TableCell>{new Date(tx.createdAt).toLocaleDateString()}</TableCell>
                                            <TableCell>{tx.lengths ? tx.lengths.join(', ') : Math.abs(tx.quantityChange)}</TableCell>
                                            <TableCell>{tx.lastLength?.toFixed(2) || 'N/A'}</TableCell>
                                            <TableCell>
                                                <Badge variant={tx.status === 'cut' ? 'default' : 'outline'} className="capitalize">{tx.status || 'pending'}</Badge>
                                            </TableCell>
                                            <TableCell>{tx.orderId}</TableCell>
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
                    <h3 className="font-semibold mb-2 text-center">Stock Added</h3>
                     <div className="border rounded-lg">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Added By</TableHead>
                                    <TableHead>Lengths</TableHead>
                                    <TableHead>Po Number</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoadingDetails ? (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin" /></TableCell></TableRow>
                                ) : stockAddedTransactions.length > 0 ? (
                                    stockAddedTransactions.map(tx => (
                                        <TableRow key={tx.id}>
                                            <TableCell>{new Date(tx.createdAt).toLocaleDateString()}</TableCell>
                                            <TableCell>{tx.createdBy}</TableCell>
                                            <TableCell>{tx.lengths ? tx.lengths.join(', ') : tx.quantityChange}</TableCell>
                                            <TableCell>{tx.poNumber}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">
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
