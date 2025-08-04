
"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Quotation, Deal, User, QuotationItem, VasDetail } from "@/lib/types";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Printer, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PrintableQuotationProfessional } from "./PrintableQuotationProfessional";

interface QuotationDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  quotation: Quotation | null;
  deal: Deal | null;
  salesmen: User[];
}

export function QuotationDetailDialog({ isOpen, onClose, quotation, deal, salesmen }: QuotationDetailDialogProps) {
  const [lineItemSearch, setLineItemSearch] = React.useState("");
  const [vasSearch, setVasSearch] = React.useState("");

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

  const handlePrint = (printType: 'default' | 'vas') => {
    const printId = `print-quotation-dialog-${quotation.id}-${printType}`;
    const printWindow = window.open('', '_blank');
    const content = document.getElementById(printId);
    if (printWindow && content) {
        const printDocument = printWindow.document;
        printDocument.write('<html><head><title>Print Quotation</title></head><body>');
        printDocument.write(content.innerHTML);
        printDocument.write('</body></html>');
        printDocument.close();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    }
  };
  
  const representativeName = salesmen.find(s => s.id === deal?.representativeId)?.name || "N/A";
  
  const filteredLineItems = (quotation.items || []).filter(item => 
    item.collectionBrand?.toLowerCase().includes(lineItemSearch.toLowerCase()) ||
    item.salesDescription?.toLowerCase().includes(lineItemSearch.toLowerCase()) ||
    item.serialNo?.toLowerCase().includes(lineItemSearch.toLowerCase())
  );

  const filteredVasItems = (quotation.vasDetails || []).filter(item => 
    item.vasName?.toLowerCase().includes(vasSearch.toLowerCase())
  );

  const productOnlyQuotation: Quotation = {
      ...quotation,
      vasDetails: [] // Exclude VAS details
  };

  const vasOnlyQuotation: Quotation = {
      ...quotation,
      items: [] // Exclude product items
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl p-0">
        <div className="p-6">
            <DialogHeader className="flex flex-row justify-between items-start">
                <div>
                    <DialogTitle className="text-2xl">Quotation Details</DialogTitle>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mt-4">
                        <p className="text-muted-foreground"><span className="font-semibold text-foreground">Quotation No:</span> {quotation.quotationNo}</p>
                        <p className="text-muted-foreground"><span className="font-semibold text-foreground">Quotation Date:</span> {format(parseDate(quotation.date), "dd/MM/yyyy")}</p>
                        <p className="text-muted-foreground"><span className="font-semibold text-foreground">Customer Name:</span> {quotation.customerName}</p>
                        <p className="text-muted-foreground"><span className="font-semibold text-foreground">Representative:</span> {representativeName}</p>
                        <p className="text-muted-foreground"><span className="font-semibold text-foreground">DealName:</span> {quotation.dealName}</p>
                        <p className="text-muted-foreground"><span className="font-semibold text-foreground">Store Name:</span> {quotation.store}</p>
                        {quotation.status === 'Converted to Order' && <p className="text-muted-foreground"><span className="font-semibold text-foreground">Order No:</span> <span className="text-primary font-bold">{quotation.orderNo}</span></p>}
                        {quotation.cpdId && <p className="text-muted-foreground"><span className="font-semibold text-foreground">From CPD ID:</span> <span className="text-primary font-bold">{quotation.cpdId}</span></p>}
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => handlePrint('default')}><Printer className="mr-2 h-4 w-4" />Print</Button>
                    {(quotation.vasDetails && quotation.vasDetails.length > 0) && (
                      <Button variant="outline" onClick={() => handlePrint('vas')}><FileText className="mr-2 h-4 w-4" />VAS Print</Button>
                    )}
                </div>
            </DialogHeader>

            <div className="mt-6">
                 <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold">Line Item Details</h3>
                    <div className="w-1/4 relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search..." className="pl-8" value={lineItemSearch} onChange={e => setLineItemSearch(e.target.value)} />
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
                            {filteredLineItems.map((item, index) => (
                                <TableRow key={item.id || index}>
                                    <TableCell>{index + 1}</TableCell>
                                    <TableCell>{item.collectionBrand}</TableCell>
                                    <TableCell>{item.serialNo || 'NA'}</TableCell>
                                    <TableCell>{item.quantity?.toFixed(2)}</TableCell>
                                    <TableCell>{item.room}</TableCell>
                                    <TableCell>{item.salesDescription}</TableCell>
                                    <TableCell><Badge variant="secondary">NEW</Badge></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {quotation.vasDetails && quotation.vasDetails.length > 0 && (
                 <div className="mt-6">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-semibold">Vas Details</h3>
                        <div className="w-1/4 relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search..." className="pl-8" value={vasSearch} onChange={e => setVasSearch(e.target.value)} />
                        </div>
                    </div>
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Vas Name</TableHead>
                                    <TableHead>Hsn</TableHead>
                                    <TableHead>Qty</TableHead>
                                    <TableHead>Rate</TableHead>
                                    <TableHead>Room</TableHead>
                                    <TableHead>Amt</TableHead>
                                    <TableHead>Discount</TableHead>
                                    <TableHead>Tax Amt</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredVasItems.map((vas, index) => {
                                     const amount = (Number(vas.rate) || 0) * (Number(vas.quantity) || 0);
                                     const taxAmount = amount * 0.05; // Assuming 5% tax
                                     return (
                                        <TableRow key={`vas-${index}`}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell>{vas.vasName}</TableCell>
                                            <TableCell>NA</TableCell>
                                            <TableCell>{Number(vas.quantity).toFixed(2)}</TableCell>
                                            <TableCell>{Number(vas.rate).toFixed(2)}</TableCell>
                                            <TableCell>{vas.room || '-'}</TableCell>
                                            <TableCell>{amount.toFixed(2)}</TableCell>
                                            <TableCell>0.00</TableCell>
                                            <TableCell>{taxAmount.toFixed(2)}</TableCell>
                                        </TableRow>
                                     );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}
        </div>
        <div className="hidden">
             {/* For the default print (only products) */}
            <div id={`print-quotation-dialog-${quotation.id}-default`}>
                <PrintableQuotationProfessional values={productOnlyQuotation} creatorName={salesmen.find(u => u.id === quotation.createdBy)?.name} salesmanName={salesmen.find(s => s.id === deal?.representativeId)?.name} />
            </div>
             {/* For the VAS print (only VAS) */}
             <div id={`print-quotation-dialog-${quotation.id}-vas`}>
                <PrintableQuotationProfessional values={vasOnlyQuotation} creatorName={salesmen.find(u => u.id === quotation.createdBy)?.name} salesmanName={salesmen.find(s => s.id === deal?.representativeId)?.name} />
            </div>
        </div>
        <DialogFooter className="bg-muted p-4">
            <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
