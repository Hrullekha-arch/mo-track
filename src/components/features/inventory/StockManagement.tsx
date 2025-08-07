
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Stock } from "@/lib/types";
import { searchStockByBcn } from "@/app/dashboard/inventory/actions";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function StockManagement() {
  const [bcnOptions, setBcnOptions] = React.useState<ComboboxOption[]>([]);
  const [selectedStock, setSelectedStock] = React.useState<Stock | null>(null);
  const [isSearching, setIsSearching] = React.useState(false);
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
      // A bit of a hack to get the full stock item into the combobox options
      setBcnOptions(options as any);
    } catch (error) {
      console.error("Error searching BCN:", error);
      toast({ variant: 'destructive', title: 'Search failed' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectStock = (value: string) => {
    const selectedOption = bcnOptions.find(opt => opt.value === value) as any;
    if (selectedOption) {
      setSelectedStock(selectedOption.stockItem);
    } else {
      setSelectedStock(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock Management</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-end gap-4">
            <div className="w-full max-w-sm space-y-2">
                 <Label htmlFor="search-stock">Search Stock</Label>
                <Combobox
                    options={bcnOptions}
                    onSelect={handleSelectStock}
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
                 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 items-center">
                    <p className="text-sm"><strong className="block text-muted-foreground">BCN:</strong> {selectedStock.bcn}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">Sr No:</strong> {selectedStock.serialNo}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">Current Stock:</strong> {selectedStock.quantity}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">Vendor:</strong> {selectedStock.vendorName}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">Category:</strong> {selectedStock.category}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">MRP:</strong> ₹{selectedStock.mrp}</p>
                    <p className="text-sm"><strong className="block text-muted-foreground">Last Updated:</strong> {new Date(selectedStock.lastUpdatedAt).toLocaleDateString()}</p>
                 </div>
                 <div className="flex justify-end mt-4">
                    <Button>Update Stock</Button>
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
                                    <TableHead>Added By</TableHead>
                                    <TableHead>Qty</TableHead>
                                    <TableHead>Po Number</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                 <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        No sold data available.
                                    </TableCell>
                                </TableRow>
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
                                    <TableHead>Qty</TableHead>
                                    <TableHead>Po Number</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        No purchase data available.
                                    </TableCell>
                                </TableRow>
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
