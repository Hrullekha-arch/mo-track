
"use client";

import * as React from "react";
import { Loader2, FileText, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { collection, onSnapshot, query, orderBy, doc, updateDoc, writeBatch, addDoc, where, getDocs, limit, FieldValue, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Invoice, Order, PrintableInvoicePayload } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintableInvoice } from "@/components/features/invoice/PrintableInvoice";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { useAuth } from "@/context/AuthContext";
import { InvoiceLogTable } from "@/components/features/invoice/InvoiceLogTable";
import { sendInvoiceToTally } from "@/services/tally";
import { StockMismatchDialog } from "@/components/features/invoice/StockMismatchDialog";
import { buildAndFetchInvoicePayload } from "./actions";

interface MismatchItem {
  itemName: string;
  crmQty: number;
  tallyQty: number;
  requiredQty?: number;
  errorType: 'mismatch' | 'insufficient';
  difference: number;
}

function GenerateInvoiceDialog({
  isOpen,
  onClose,
  payload,
  creator,
}: {
  isOpen: boolean;
  onClose: () => void;
  payload: PrintableInvoicePayload | null;
  creator: { id: string, name: string } | null;
}) {
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [tallySyncResult, setTallySyncResult] = React.useState<{ success: boolean; message: string; voucherNumber?: string; } | null>(null);

  const { toast } = useToast();

  const handleFinalGenerate = React.useCallback(async () => {
    if (!creator || !payload) {
      toast({ variant: 'destructive', title: 'Error', description: 'Missing required data to generate invoice.' });
      return;
    }
    
    setIsGenerating(true);
    
    try {
      const newInvoiceRef = doc(collection(db, "invoices"));
      const isVas = payload.meta.isVas;

      const tallyResult = await sendInvoiceToTally(payload, isVas);
      
      const finalInvoiceData: Omit<Invoice, 'id'> = {
          ...payload,
          invoiceNo: '', // Will be set from Tally
          tallyVoucherNo: tallyResult.voucherNumber,
          createdAt: new Date().toISOString(),
          createdBy: creator.name,
      };
      
      if(tallyResult.voucherNumber) {
        finalInvoiceData.invoiceNo = tallyResult.voucherNumber;
      }

      await setDoc(newInvoiceRef, finalInvoiceData);

      setTallySyncResult(tallyResult);

    } catch (error) {
      console.error("Error finalizing invoice:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not finalize the invoice.' });
      setIsGenerating(false);
    }
  }, [creator, toast, payload]);
  
  const handlePrint = () => {
    const printContent = document.getElementById('printable-invoice-content');
    if (!printContent) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write('<html><head><title>Print Invoice</title></head><body>');
        printWindow.document.write(printContent.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
    }
  };

  const resetAndClose = () => {
    setTallySyncResult(null);
    onClose();
    setIsGenerating(false);
  }

  return (
    <>
      <Dialog open={isOpen && !tallySyncResult} onOpenChange={onClose}>
          <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
              <DialogHeader>
                  <DialogTitle>Generate Invoice</DialogTitle>
                  <DialogDescription>Review the generated invoice details below. This will be sent to Tally.</DialogDescription>
              </DialogHeader>
              <div className="flex-grow overflow-y-auto pr-4" id="printable-invoice-content">
                  <PrintableInvoice payload={payload} />
              </div>
              <DialogFooter>
                  <Button variant="ghost" onClick={onClose}>Cancel</Button>
                  <Button variant="outline" onClick={handlePrint}><Printer className="mr-2 h-4 w-4"/> Print</Button>
                  <Button onClick={handleFinalGenerate} disabled={isGenerating}>
                      {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Confirm & Generate
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
      {tallySyncResult && (
        <AlertDialog open={!!tallySyncResult} onOpenChange={() => resetAndClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Tally Sync Result</AlertDialogTitle>
                    <AlertDialogDescription>{tallySyncResult.message}</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-2">
                    <p className="text-sm font-semibold">Tally Voucher No:</p>
                    <p className="text-lg font-mono p-2 bg-muted rounded-md">{tallySyncResult.voucherNumber || "Not available"}</p>
                </div>
                <AlertDialogFooter>
                    <AlertDialogAction onClick={resetAndClose}>Close</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}

export default function InvoicePage() {
  const [orderNo, setOrderNo] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [payload, setPayload] = React.useState<PrintableInvoicePayload | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  
  const { user } = useAuth();
  const { toast } = useToast();

  const handleFetchInvoiceData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNo) {
        toast({ variant: 'destructive', title: 'Order number required' });
        return;
    }
    setLoading(true);
    setPayload(null);
    try {
        const result = await buildAndFetchInvoicePayload(orderNo);
        if (result.success && result.payload) {
            setPayload(result.payload);
            setIsPreviewOpen(true);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
        setLoading(false);
    }
  };
    
  return (
    <div className="w-full p-4 md:p-6 lg:p-8">
        <header className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Generate Invoice</h1>
            <p className="text-muted-foreground">
                Enter an order number to fetch its data and generate a sales invoice.
            </p>
        </header>

        <Card className="mb-8">
            <CardContent className="pt-6">
                <form onSubmit={handleFetchInvoiceData} className="flex items-end gap-4">
                    <div className="flex-grow">
                        <label htmlFor="order-no-input" className="text-sm font-medium">Order Number</label>
                        <Input 
                            id="order-no-input"
                            placeholder="Enter order number (e.g., 1222)"
                            value={orderNo}
                            onChange={(e) => setOrderNo(e.target.value)}
                        />
                    </div>
                    <Button type="submit" disabled={loading || !orderNo}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Search className="mr-2 h-4 w-4" />
                        Fetch Invoice Data
                    </Button>
                </form>
            </CardContent>
        </Card>
        
        <InvoiceLogTable />

        <GenerateInvoiceDialog
            isOpen={isPreviewOpen}
            onClose={() => setIsPreviewOpen(false)}
            payload={payload}
            creator={user ? {id: user.uid, name: user.displayName || 'System'} : null}
        />
    </div>
  )
}
