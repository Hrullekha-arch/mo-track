
"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Quotation } from "@/lib/types";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Printer, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { QuotationPreview } from "./QuotationPreview";

interface QuotationDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  quotation: Quotation | null;
}

export function QuotationDetailDialog({ isOpen, onClose, quotation }: QuotationDetailDialogProps) {
  if (!quotation) return null;

  const parseDate = (date: any): Date => {
    if (date instanceof Date) return date;
    if (date && date._seconds) { // Handle Firestore Timestamps
        return new Date(date._seconds * 1000 + (date._nanoseconds || 0) / 1000000);
    }
    if (typeof date === 'string' || typeof date === 'number') {
        const parsed = new Date(date);
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }
    }
    return new Date(); // Fallback
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const content = document.getElementById(`print-quotation-dialog-${quotation.id}`);
    if (printWindow && content) {
        const printDocument = printWindow.document;
        printDocument.write('<html><head><title>Print Quotation</title></head><body>');
        printDocument.write(content.innerHTML);
        printDocument.write('</body></html>');
        printDocument.close();
        // Use a timeout to ensure the content is fully loaded before printing
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0">
        <div className="p-6">
            <DialogHeader className="flex flex-row justify-between items-start">
                <div>
                    <DialogTitle className="text-2xl">Quotation Details</DialogTitle>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-muted-foreground mt-4">
                        <p><span className="font-semibold text-foreground">Quotation No:</span> {quotation.quotationNo}</p>
                        <p><span className="font-semibold text-foreground">Quotation Date:</span> {format(parseDate(quotation.date), "dd/MM/yyyy")}</p>
                        <p><span className="font-semibold text-foreground">Customer Name:</span> {quotation.customerName}</p>
                        <p><span className="font-semibold text-foreground">Representative:</span> {quotation.items[0]?.collectionBrand || 'N/A'}</p> {/* Placeholder for Representative */}
                        <p><span className="font-semibold text-foreground">DealName:</span> {quotation.dealName}</p>
                        <p><span className="font-semibold text-foreground">Store Name:</span> {quotation.store}</p>
                        <p><span className="font-semibold text-foreground">Order No:</span> {quotation.id.substring(0, 4)}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={handlePrint}><Printer className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon"><FileText className="h-4 w-4" /></Button>
                    {/* Add other icons as needed */}
                </div>
            </DialogHeader>

            <div className="mt-6">
                 <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold">Line Item Details</h3>
                    <div className="w-1/4 relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search..." className="pl-8" />
                    </div>
                </div>
                <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Collection / Brand Name</TableHead>
                                <TableHead>Serial No</TableHead>
                                <TableHead>Quantity</TableHead>
                                <TableHead>Room</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {quotation.items.map((item, index) => (
                                <TableRow key={item.id || index}>
                                    <TableCell>{index + 1}</TableCell>
                                    <TableCell>{item.collectionBrand}</TableCell>
                                    <TableCell>{item.serialNo}</TableCell>
                                    <TableCell>{item.quantity}</TableCell>
                                    <TableCell>{item.room}</TableCell>
                                    <TableCell>{item.salesDescription}</TableCell>
                                    <TableCell><Badge variant="secondary">NEW</Badge></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
        <div className="hidden">
            <div id={`print-quotation-dialog-${quotation.id}`}>
                <QuotationPreview values={quotation as any} />
            </div>
        </div>
        <DialogFooter className="bg-muted p-4">
            <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
