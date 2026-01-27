
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
import { ArrowUpDown, FileText, Loader2, Printer, Search, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { collection, query, where, limit, getDocs, doc, getDoc, writeBatch, collectionGroup } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintableInvoice, PrintableInvoicePayload } from "@/components/features/invoice/PrintableInvoice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { useAuth } from "@/context/AuthContext";
import { sendInvoiceToTally } from "@/services/tally";
import { Order, Quotation, Invoice } from "@/lib/types";
import { InvoiceLogTable } from "@/components/features/invoice/InvoiceLogTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function InvoicePage() {
  const [orderNo, setOrderNo] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [orderData, setOrderData] = React.useState<Order | null>(null);
  const [quotationData, setQuotationData] = React.useState<Quotation | null>(null);
  const [payload, setPayload] = React.useState<PrintableInvoicePayload | null>(null);
  const [showPreview, setShowPreview] = React.useState(false);
  const [tallySyncResult, setTallySyncResult] = React.useState<{ success: boolean; message: string; voucherNumber?: string; } | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchOrderData = async (orderNumber: string) => {
    try {
      setLoading(true);
      const fullOrderId = `MOTRACK-${orderNumber}`;
      
      const orderRef = doc(db, "orders", fullOrderId);
      const orderSnap = await getDoc(orderRef);
      
      if (!orderSnap.exists()) {
        toast({ variant: "destructive", title: "Order Not Found", description: `No order found with number ${fullOrderId}` });
        return;
      }
      
      const order = { id: orderSnap.id, ...orderSnap.data() } as Order;
      setOrderData(order);
      
      const quotationNo = order.crmOrderNo;
      
      const quotationSnap = await getDocs(
        query(collectionGroup(db, "quotations"), where("quotationNo", "==", quotationNo), limit(1))
      );
      
      if (quotationSnap.empty) {
        toast({ variant: "destructive", title: "Quotation Not Found", description: `No quotation found with number ${quotationNo}` });
        return;
      }
      
      const quotation = { ...quotationSnap.docs[0].data(), id: quotationSnap.docs[0].id } as Quotation;
      setQuotationData(quotation);
      
      buildInvoicePayload(order, quotation);
      setShowPreview(true);
      
    } catch (error) {
      console.error("Error fetching order data:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to fetch order data" });
    } finally {
      setLoading(false);
    }
  };

  const buildInvoicePayload = (order: Order, quotation: Quotation) => {
    const invoiceItems = quotation.items.map(item => ({
      name: item.salesDescription || item.collectionBrand,
      bcn: item.collectionBrand,
      hsn: item.hsnCode || "54076190",
      quantity: item.quantity,
      uom: 'Mtr',
      rate: item.rate,
      discountPercent: item.discountPercent || 0,
      taxableAmount: item.taxableAmt || 0,
      cgst: item.cgst || 0,
      sgst: item.sgst || 0,
      igst: item.igst || 0,
      total: item.subtotal || 0,
    }));

    const totals = invoiceItems.reduce(
      (acc, item) => ({
        subTotal: acc.subTotal + (item.rate * item.quantity),
        discount: acc.discount + ((item.rate * item.quantity * (item.discountPercent || 0)) / 100),
        taxableValue: acc.taxableValue + item.taxableAmount,
        cgst: acc.cgst + item.cgst,
        sgst: acc.sgst + item.sgst,
        igst: acc.igst + item.igst,
      }),
      { subTotal: 0, discount: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
    );

    const grandTotal = totals.taxableValue + totals.cgst + totals.sgst + totals.igst;
    const roundedTotal = Math.round(grandTotal);
    const roundOff = roundedTotal - grandTotal;

    const gstBreakdown = Array.from(new Set(quotation.items.map(i => i.gstPercent || 5)))
      .map(rate => {
        const itemsForRate = quotation.items.filter(i => (i.gstPercent || 5) === rate);
        return {
          rate: rate,
          taxable: itemsForRate.reduce((sum, i) => sum + (i.taxableAmt || 0), 0),
          cgst: itemsForRate.reduce((sum, i) => sum + (i.cgst || 0), 0),
          sgst: itemsForRate.reduce((sum, i) => sum + (i.sgst || 0), 0),
          igst: itemsForRate.reduce((sum, i) => sum + (i.igst || 0), 0),
        };
      });

    const newPayload: PrintableInvoicePayload = {
      meta: {
        orderNo: order.id,
        quotationNo: order.crmOrderNo,
        invoiceDate: new Date().toISOString(),
        isVas: false,
        salesPerson: order.salesPerson,
      },
      customer: {
        name: quotation.billingName || order.customerName,
        phone: order.customerPhone,
        address: quotation.billingAddress || order.customerAddress,
      },
      seller: {
        companyName: quotation.company || 'MO Designs Private Limited - (2024-2025)',
        address: 'A-6, Sushant Lok-1, M G Road, Gurgaon- 122022, B-50, Sushant Lok-2, Sec- 56, Gurgaon - 122011 GURGAON. (HARYANA) INDIA',
        gstin: '06AAMCM5012B1ZY',
      },
      items: invoiceItems,
      totals: {
        subTotal: totals.subTotal,
        discount: totals.discount,
        taxableValue: totals.taxableValue,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        roundOff: roundOff,
        grandTotal: roundedTotal,
        totalGst: totals.cgst + totals.sgst + totals.igst,
      },
      gstBreakdown: gstBreakdown,
    };

    setPayload(newPayload);
  };

  const handleGenerateInvoice = async () => {
    if (!orderData || !payload || !user) {
      toast({ variant: "destructive", title: "Error", description: "Missing required data" });
      return;
    }

    setIsGenerating(true);

    try {
      const invoiceRef = doc(collection(db, "invoices"));
      const invoiceData = {
        orderId: orderData.id,
        isVas: false,
        customer: payload.customer,
        salesPerson: orderData.salesPerson,
        items: payload.items.map(item => ({
          itemName: item.name,
          bcn: item.bcn,
          quantityAllocated: item.quantity,
          rate: item.rate,
          discountPercent: item.discountPercent,
        })),
        totals: payload.totals,
        gstPercentages: {
          cgst: payload.gstBreakdown[0]?.rate / 2 || 2.5,
          sgst: payload.gstBreakdown[0]?.rate / 2 || 2.5,
          igst: 0,
          total: payload.gstBreakdown[0]?.rate || 5,
        },
        createdAt: new Date().toISOString(),
        createdBy: user.displayName || 'System',
        invoiceNo: '',
      };
      
      const fullInvoiceData = { ...invoiceData, id: invoiceRef.id };
      
      await setDoc(invoiceRef, fullInvoiceData);
      
      const tallyResult = await sendInvoiceToTally(fullInvoiceData, false);

      if (tallyResult.success && tallyResult.voucherNumber) {
        await updateDoc(invoiceRef, {
          tallyVoucherNo: tallyResult.voucherNumber,
          invoiceNo: tallyResult.voucherNumber,
        });
      }
      
      setTallySyncResult(tallyResult);

    } catch (error) {
      console.error("Error generating invoice:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to generate invoice" });
    } finally {
      setIsGenerating(false);
    }
  };

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

  const resetAndClose = () => {
    setShowPreview(false);
    setOrderData(null);
    setQuotationData(null);
    setPayload(null);
    setTallySyncResult(null);
    setOrderNo("");
  };

  return (
    <div className="w-full p-4 md:p-6 lg:p-8">
      <Tabs defaultValue="generate">
        <TabsList>
            <TabsTrigger value="generate">Generate Invoice</TabsTrigger>
            <TabsTrigger value="history">Invoice Log</TabsTrigger>
        </TabsList>
        <TabsContent value="generate" className="mt-4">
            <Card className="max-w-2xl mx-auto">
                <CardHeader>
                <CardTitle>Invoice Generation</CardTitle>
                <CardDescription>
                    Enter the numeric order number (e.g., 4106 for MOTRACK-4106)
                </CardDescription>
                </CardHeader>
                <CardContent>
                <div className="space-y-4">
                    <div className="flex gap-2">
                    <div className="flex-1">
                        <Label htmlFor="orderNo">Order Number</Label>
                        <Input
                        id="orderNo"
                        placeholder="e.g., 4106"
                        value={orderNo}
                        onChange={(e) => setOrderNo(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && orderNo.trim()) {
                            fetchOrderData(orderNo.trim());
                            }
                        }}
                        />
                    </div>
                    <Button
                        className="mt-auto"
                        onClick={() => fetchOrderData(orderNo.trim())}
                        disabled={!orderNo.trim() || loading}
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        <span className="ml-2">Fetch</span>
                    </Button>
                    </div>

                    {orderData && (
                    <div className="p-4 border rounded-lg space-y-2 bg-muted/50">
                        <p className="text-sm font-semibold">Order Details:</p>
                        <p className="text-sm">**Order No:** MOTRACK-{orderData.crmOrderNo}</p>
                        <p className="text-sm">**Customer:** {orderData.customerName}</p>
                        <p className="text-sm">**Phone:** {orderData.customerPhone}</p>
                        <p className="text-sm">**Sales Person:** {orderData.salesPerson}</p>
                    </div>
                    )}
                </div>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="history" className="mt-4">
            <InvoiceLogTable />
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={showPreview && !tallySyncResult} onOpenChange={(open) => !open && resetAndClose()}>
        <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Invoice Preview</DialogTitle>
            <DialogDescription>
              Review the invoice details before generating.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto pr-4" id="printable-invoice-content">
            <PrintableInvoice payload={payload} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={resetAndClose}>Cancel</Button>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            <Button onClick={handleGenerateInvoice} disabled={isGenerating}>
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <FileText className="mr-2 h-4 w-4" />
              Generate Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tally Sync Result Dialog */}
      <AlertDialog open={!!tallySyncResult} onOpenChange={() => resetAndClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {tallySyncResult?.success ? <CheckCircle className="text-green-500" /> : <XCircle className="text-destructive" />}
              Invoice {tallySyncResult?.success ? "Generated Successfully" : "Generation Failed"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tallySyncResult?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {tallySyncResult?.voucherNumber && (
            <div className="py-2">
              <p className="text-sm font-semibold">Invoice Number:</p>
              <p className="text-lg font-mono p-2 bg-muted rounded-md">
                {tallySyncResult.voucherNumber}
              </p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogAction onClick={resetAndClose}>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
