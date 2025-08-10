
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState, useEffect, useCallback } from "react";
import { UpdateBatchTaxDialog } from "./UpdateBatchTaxDialog";
import { UpdateBatchRackDialog } from "./UpdateBatchRackDialog";
import { searchStockByBcn, getStockTransactions } from "@/app/dashboard/inventory/actions";
import { useToast } from "@/hooks/use-toast";
import { Stock, StockTransaction } from "@/lib/types";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Loader2, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StockLengthSticker } from "./StockLengthSticker";

export function StockDetails() {
  const [isTaxDialogOpen, setIsTaxDialogOpen] = useState(false);
  const [isRackDialogOpen, setIsRackDialogOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);

  const [bcnOptions, setBcnOptions] = useState<ComboboxOption[]>([]);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const { toast } = useToast();

  const handleBcnSearch = useCallback(async (query: string) => {
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
  }, [toast]);

  const handleSelectStock = useCallback(async (stockItem: Stock) => {
    setSelectedStock(stockItem);
    setIsLoadingTransactions(true);
    try {
      const fetchedTransactions = await getStockTransactions(stockItem.id);
      setTransactions(fetchedTransactions);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error fetching history' });
    } finally {
      setIsLoadingTransactions(false);
    }
  }, [toast]);
  
  const stockAddedTransactions = transactions.filter(t => t.type === 'addition' && t.quantityChange > 0);

  const handlePrint = () => {
    const printContent = document.getElementById('sticker-print-area');
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write('<html><head><title>Print Stickers</title>');
    printWindow.document.write(`
        <style>
            @media print {
                @page { size: 72.2mm 49.8mm; margin: 0; }
                body { margin: 0; -webkit-print-color-adjust: exact; }
                .sticker-container { page-break-after: always; }
            }
        </style>
    `);
    printWindow.document.write('</head><body>');
    printWindow.document.write(printContent.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    }, 250);
  };

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Stock Details</CardTitle>
        <CardDescription>
          Search for a stock item to view details. Sticker printing has been moved to the cutting page for accuracy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
            <div className="w-full max-w-sm space-y-2">
                <Label htmlFor="search-stock">Search Stock by BCN</Label>
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
        
        <div className="flex gap-4">
            <Button onClick={() => setIsTaxDialogOpen(true)}>Update Batch Tax</Button>
            <Button onClick={() => setIsRackDialogOpen(true)}>Update Batch Rack</Button>
        </div>
      </CardContent>
    </Card>
    
    <UpdateBatchTaxDialog isOpen={isTaxDialogOpen} onClose={() => setIsTaxDialogOpen(false)} />
    <UpdateBatchRackDialog isOpen={isRackDialogOpen} onClose={() => setIsRackDialogOpen(false)} />

    </>
  );
}
