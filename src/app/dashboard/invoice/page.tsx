
"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  RowSelectionState,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronRight, Loader2, FileText, Printer, CheckCircle, XCircle, Combine } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { collection, onSnapshot, query, getDocs, doc, writeBatch, where, orderBy, limit, increment, collectionGroup, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { InvoiceBatch, Order, Invoice, CuttingTask, StockTransaction, PrintableInvoicePayload } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintableInvoice } from "@/components/features/invoice/PrintableInvoice";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { InvoiceLogTable } from "@/components/features/invoice/InvoiceLogTable";
import { sendInvoiceToTally } from "@/services/tally";
import { buildAndFetchInvoicePayload } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function GenerateInvoiceDialog({
  isOpen,
  onClose,
  payload,
}: {
  isOpen: boolean;
  onClose: () => void;
  payload: PrintableInvoicePayload | null;
}) {
  const [isGenerating, setIsGenerating] = React.useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  
  const handleFinalGenerate = React.useCallback(async () => {
    if (!user || !payload) {
        toast({ variant: 'destructive', title: 'Error', description: 'Missing required data' });
        return;
    }
     
    setIsGenerating(true);
    
    try {
        const batch = writeBatch(db);
        
        const randomInvoiceNo = Math.floor(1000 + Math.random() * 9000).toString();
        const newInvoiceRef = doc(collection(db, "invoices"));

        const invoiceData: Omit<Invoice, 'id'> = {
            invoiceNo: randomInvoiceNo,
            orderId: payload.meta.orderNo,
            isVas: payload.meta.isVas,
            customer: payload.customer,
            salesPerson: payload.meta.salesPerson || 'N/A',
            items: payload.items.map(item => ({
              itemName: item.name,
              bcn: item.bcn,
              quantityAllocated: item.quantity,
              rate: item.rate,
              discountPercent: item.discountPercent,
            })),
            totals: payload.totals,
            createdAt: new Date().toISOString(),
            createdBy: user?.name || 'System',
        };
        
        batch.set(newInvoiceRef, invoiceData);

        // --- STOCK DEDUCTION LOGIC ---
        for (const item of payload.items) {
            const stockId = item.bcn.replace(/\//g, '-');
            const stockRef = doc(db, 'stocks', stockId);

            batch.update(stockRef, {
                quantity: increment(-item.quantity),
                reservedQty: increment(-item.quantity),
                cutQty: increment(item.quantity),
            });
        }

        // Create cutting task
        const cuttingTaskRef = doc(collection(db, "Cutting"));
        const cuttingTask: Omit<CuttingTask, 'id'> = {
          invoiceId: newInvoiceRef.id,
          orderId: payload.meta.orderNo,
          customerName: payload.customer.name,
          customerPhone: payload.customer.phone,
          salesPerson: payload.meta.salesPerson || 'N/A',
          items: payload.items.map(item => ({
            itemName: item.name,
            bcn: item.bcn,
            quantityAllocated: item.quantity,
            rate: item.rate,
            discountPercent: item.discountPercent,
            status: 'pending',
            originalLength: 0,
          })),
          createdAt: new Date().toISOString(),
          status: "Pending",
        };
        batch.set(cuttingTaskRef, cuttingTask);

        await batch.commit();
        
        toast({ 
          title: 'Success', 
          description: `Invoice ${randomInvoiceNo} generated successfully.` 
        });

        onClose();

    } catch (error) {
      toast({ 
        variant: 'destructive', 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'Failed to generate invoice' 
      });
    } finally {
        setIsGenerating(false);
    }
  }, [user, toast, payload, onClose]);
  
  const handlePrint = () => {
    const printContent = document.getElementById('printable-invoice-content');
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write('<html><head><title>Print Invoice</title></head><body>');
    printWindow.document.write(printContent.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Generate Invoice</DialogTitle>
            <DialogDescription>
              Review the invoice details before generating.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto pr-4" id="printable-invoice-content">
            {payload ? <PrintableInvoice payload={payload} /> : <Loader2 className="h-6 w-6 animate-spin mx-auto" />}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="outline" onClick={handlePrint} disabled={!payload}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            <Button onClick={handleFinalGenerate} disabled={isGenerating || !payload}>
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <FileText className="mr-2 h-4 w-4" />
              Generate Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}

export default function InvoicePage() {
  const [orderNo, setOrderNo] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = React.useState(false);
  const [invoicePayload, setInvoicePayload] = React.useState<PrintableInvoicePayload | null>(null);
  const { toast } = useToast();

  const handleFetch = async () => {
    if (!orderNo) {
      toast({ variant: 'destructive', title: 'Order Number Required' });
      return;
    }
    setLoading(true);
    setInvoicePayload(null);
    try {
      const result = await buildAndFetchInvoicePayload(orderNo);
      if (result.success && result.payload) {
        setInvoicePayload(result.payload);
        setIsGenerateDialogOpen(true);
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.message || 'Could not fetch invoice data.' });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Server Error', description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <div className="w-full p-4 md:p-6 lg:p-8">
        <header className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Generate Invoice</h1>
            <p className="text-muted-foreground">
              Enter an order number to fetch its data and generate a new invoice.
            </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Fetch Order for Invoice</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="flex items-end gap-2">
               <div className="grid w-full max-w-sm items-center gap-1.5">
                  <Label htmlFor="order-no-input">Order Number</Label>
                  <Input 
                    id="order-no-input" 
                    placeholder="e.g. 1222"
                    value={orderNo}
                    onChange={(e) => setOrderNo(e.target.value)}
                  />
               </div>
               <Button onClick={handleFetch} disabled={loading}>
                 {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                 Fetch Invoice Data
               </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8">
            <InvoiceLogTable />
        </div>
    </div>
    <GenerateInvoiceDialog
        isOpen={isGenerateDialogOpen}
        onClose={() => setIsGenerateDialogOpen(false)}
        payload={invoicePayload}
    />
    </>
  )
}
