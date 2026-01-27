
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
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintableInvoice, PrintableInvoicePayload } from "@/components/features/invoice/PrintableInvoice";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { InvoiceLogTable } from "@/components/features/invoice/InvoiceLogTable";
import { sendInvoiceToTally } from "@/services/tally";
import { buildAndFetchInvoicePayload } from "./actions";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

function GenerateInvoiceDialog({
  isOpen,
  onClose,
  payload,
  creator,
}: {
  isOpen: boolean;
  onClose: () => void;
  payload: PrintableInvoicePayload;
  creator: { id: string, name: string } | null;
}) {
  const [isGenerating, setIsGenerating] = React.useState(false);
  const { toast } = useToast();

  const handleFinalGenerate = async () => {
      // This is a placeholder for the final generation logic
      // which would save the invoice and interact with Tally.
      // For now, it just shows a success message.
      setIsGenerating(true);
      toast({ title: 'Generating...', description: 'Saving invoice and syncing with Tally.' });
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsGenerating(false);
      onClose();
      toast({ title: 'Success!', description: 'Invoice has been generated.' });
  };
  
  const handlePrint = () => {
    const printContent = document.getElementById('printable-invoice-content');
    if (!printContent) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Invoice</title></head><body>');
      printWindow.document.write(printContent.innerHTML);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 250);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>Generate Invoice</DialogTitle>
                <DialogDescription>
                    Review the items below. An invoice will be generated for the selected order.
                </DialogDescription>
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
  );
}


export default function NewInvoiceGenerationPage() {
  const [orderNo, setOrderNo] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [payload, setPayload] = React.useState<PrintableInvoicePayload | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleFetch = async () => {
    if (!orderNo.trim()) {
      setError("Please enter an Order Number.");
      return;
    }
    setLoading(true);
    setError(null);
    setPayload(null);
    try {
      const result = await buildAndFetchInvoicePayload(`MOTRACK-${orderNo.trim()}`);
      if (result.success && result.payload) {
        setPayload(result.payload);
      } else {
        setError(result.message || "Failed to fetch invoice data.");
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred.");
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full p-4 md:p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Generate Invoice</h1>
        <p className="text-muted-foreground">
          Enter an order number to fetch details and generate an invoice.
        </p>
      </header>
      
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-end gap-2">
            <div className="w-full max-w-xs space-y-1.5">
              <label htmlFor="order-no-input">Order Number</label>
              <Input
                id="order-no-input"
                placeholder="e.g., 1234"
                value={orderNo}
                onChange={(e) => setOrderNo(e.target.value)}
                onKeyDown={(e) => { if(e.key === 'Enter') handleFetch() }}
              />
            </div>
            <Button onClick={handleFetch} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Fetch
            </Button>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="mt-8">
        <InvoiceLogTable />
      </div>
      
      {payload && (
        <GenerateInvoiceDialog 
          isOpen={!!payload} 
          onClose={() => setPayload(null)}
          payload={payload}
          creator={user ? { id: user.id, name: user.name } : null}
        />
      )}
    </div>
  );
}
