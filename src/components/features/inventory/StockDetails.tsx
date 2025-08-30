

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
  
  const stockAddedTransactions = transactions.filter(t => t.type === 'addition');

  const handlePrint = () => {
    const printContent = document.getElementById('sticker-print-area');
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const styles = `
      <style>
        @media print {
          @page { size: 72.1mm 48.9mm; margin: 0; }
          body { margin: 0; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; }
          .sticker-container {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            page-break-after: always !important;
            width: 72.1mm !important;
            height: 48.9mm !important;
            box-sizing: border-box !important;
          }
          /* Add other necessary styles to preserve layout */
          .flex { display: flex !important; }
          .items-center { align-items: center !important; }
          .justify-between { justify-content: space-between !important; }
          .justify-center { justify-content: center !important; }
          .flex-col { flex-direction: column !important; }
          .text-center { text-align: center !important; }
          .font-bold { font-weight: bold !important; }
          .text-xs { font-size: 10px !important; }
          .text-sm { font-size: 12px !important; }
          .text-base { font-size: 14px !important; }
          .leading-tight { line-height: 1.2 !important; }
          .leading-none { line-height: 1 !important; }
          .my-1 { margin-top: 4px !important; margin-bottom: 4px !important; }
          .mt-1 { margin-top: 4px !important; }
          .space-y-1 > * + * { margin-top: 4px !important; }
          .flex-shrink-0 { flex-shrink: 0 !important; }
          .w-full { width: 100% !important; }
          .max-w-\\[95\\%\\] { max-width: 95% !important; }
        }
      </style>
    `;

    printWindow.document.write('<html><head><title>Print Stickers</title>');
    printWindow.document.write(styles);
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
          Search for a stock item to view details and print stickers for available rolls.
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
             <Button onClick={() => setIsPrintDialogOpen(true)} disabled={!selectedStock || stockAddedTransactions.length === 0}>
                <Printer className="mr-2 h-4 w-4" />
                Print Stickers
            </Button>
        </div>
        
        <div className="flex gap-4">
            <Button onClick={() => setIsTaxDialogOpen(true)}>Update Batch Tax</Button>
            <Button onClick={() => setIsRackDialogOpen(true)}>Update Batch Rack</Button>
        </div>
      </CardContent>
    </Card>
    
    <UpdateBatchTaxDialog isOpen={isTaxDialogOpen} onClose={() => setIsTaxDialogOpen(false)} />
    <UpdateBatchRackDialog isOpen={isRackDialogOpen} onClose={() => setIsRackDialogOpen(false)} />

     <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>Print Stock Stickers</DialogTitle>
                <DialogDescription>
                    Print stickers for available rolls of {selectedStock?.bcn}. Each sticker represents a physical roll.
                </DialogDescription>
            </DialogHeader>
            <div id="sticker-print-area" className="py-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto">
                {isLoadingTransactions ? (
                    <div className="col-span-full flex justify-center items-center h-40">
                         <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                ) : stockAddedTransactions.length > 0 ? (
                    stockAddedTransactions.map(tx => (
                        <StockLengthSticker
                            key={tx.id}
                            bcn={selectedStock!.bcn!}
                            length={tx.quantityChange}
                            rack={selectedStock!.rack!}
                        />
                    ))
                ) : (
                    <div className="col-span-full text-center text-muted-foreground py-10">
                        No available rolls to print for this item.
                    </div>
                )}
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => setIsPrintDialogOpen(false)}>Cancel</Button>
                <Button onClick={handlePrint} disabled={stockAddedTransactions.length === 0}>Print</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    </>
  );
}
