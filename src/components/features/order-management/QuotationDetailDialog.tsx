"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Quotation, Deal, User, Cpd, Customer } from "@/lib/types";
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
  customer?: Customer;
  salesmen: User[];
  cpds: Cpd[];
  onEdit?: () => void;
}

const parseDate = (date: any): Date => {
  if (date instanceof Date) return date;
  if (date && date._seconds) {
    return new Date(date._seconds * 1000 + (date._nanoseconds || 0) / 1000000);
  }
  if (typeof date === "string" || typeof date === "number") {
    const parsed = new Date(date);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
};

export function QuotationDetailDialog({
  isOpen,
  onClose,
  quotation,
  deal,
  customer,
  salesmen,
  cpds,
  onEdit,
}: QuotationDetailDialogProps) {
  const [lineItemSearch, setLineItemSearch] = React.useState("");
  const [vasSearch, setVasSearch] = React.useState("");

  React.useEffect(() => {
    if (!isOpen) {
      setLineItemSearch("");
      setVasSearch("");
    }
  }, [isOpen]);

  const handlePrint = React.useCallback((printType: "default" | "vas") => {
    if (!quotation) return;

    const printId = `print-quotation-dialog-${quotation.id}-${printType}`;
    const content = document.getElementById(printId);
    if (!content) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const styleTags = Array.from(
      document.querySelectorAll('style, link[rel="stylesheet"]')
    )
      .map((node) => node.outerHTML)
      .join("\n");

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Print Quotation</title>
          ${styleTags}
          <style>
            @page { size: A4 portrait; margin: 0; }
            html, body {
              width: 210mm;
              margin: 0;
              padding: 0;
              overflow: visible;
              background: #fff;
            }
            *, *::before, *::after { box-sizing: border-box; }
            .quotation-print-page {
              width: 210mm !important;
              max-width: 210mm !important;
              margin: 0 !important;
              overflow: hidden !important;
            }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            thead { display: table-header-group; }
            tfoot { display: table-row-group; }
            img { max-width: 100% !important; }
          </style>
        </head>
        <body>
          ${content.innerHTML}
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    const runPrint = () => {
      printWindow.focus();
      printWindow.print();
    };

    printWindow.onafterprint = () => {
      printWindow.close();
    };

    if (printWindow.document.readyState === "complete") {
      window.setTimeout(runPrint, 250);
    } else {
      printWindow.onload = () => window.setTimeout(runPrint, 250);
    }
  }, [quotation]);
  
  const representativeName =
    salesmen.find((s) => s.id === (deal?.assignedSalesPerson?.id || deal?.representativeId))
      ?.name ||
    deal?.assignedSalesPerson?.name ||
    "N/A";
  const creatorName = quotation
    ? salesmen.find((u) => u.id === quotation.createdBy)?.name || "N/A"
    : "N/A";

  const filteredLineItems = React.useMemo(
    () =>
      (quotation?.items || []).filter(
        (item) =>
          item.collectionBrand?.toLowerCase().includes(lineItemSearch.toLowerCase()) ||
          item.salesDescription?.toLowerCase().includes(lineItemSearch.toLowerCase()) ||
          item.serialNo?.toLowerCase().includes(lineItemSearch.toLowerCase())
      ),
    [quotation, lineItemSearch]
  );

  const filteredVasItems = React.useMemo(
    () =>
      (quotation?.vasDetails || []).filter((item) =>
        item.vasName?.toLowerCase().includes(vasSearch.toLowerCase())
      ),
    [quotation, vasSearch]
  );

  const productOnlyQuotation = quotation
    ? {
        ...quotation,
        vasDetails: [],
      }
    : null;

  const vasOnlyQuotation = quotation
    ? {
        ...quotation,
        items: [],
      }
    : null;

  const cpdReference = quotation ? cpds.find((cpd) => cpd.id === quotation.cpdId) : null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-7xl max-h-[95vh] overflow-auto p-0">
        {quotation ? (
          <>
            <div className="p-6">
              <DialogHeader className="flex flex-row justify-between items-start">
                <div>
                  <DialogTitle className="text-2xl">Quotation Details</DialogTitle>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mt-4">
                    <p className="text-muted-foreground">
                      <span className="font-semibold text-foreground">Quotation No:</span> {quotation.quotationNo}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-semibold text-foreground">Quotation Date:</span> {format(parseDate(quotation.date), "dd/MM/yyyy")}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-semibold text-foreground">Customer Name:</span> {quotation.customerName}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-semibold text-foreground">Representative:</span> {representativeName}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-semibold text-foreground">DealName:</span> {quotation.dealName}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-semibold text-foreground">Store Name:</span> {quotation.store}
                    </p>
                    {quotation.status === "Converted to Order" && quotation.orderNo && (
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-foreground">Order No:</span>{" "}
                        <span className="text-primary font-bold">{quotation.orderNo}</span>
                      </p>
                    )}
                    {cpdReference && (
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-foreground">From CPD ID:</span>{" "}
                        <span className="text-primary font-bold">{cpdReference.cpdId}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => handlePrint("default")}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print
                  </Button>
                  {quotation.vasDetails && quotation.vasDetails.length > 0 && (
                    <Button variant="outline" onClick={() => handlePrint("vas")}>
                      <FileText className="mr-2 h-4 w-4" />
                      VAS Print
                    </Button>
                  )}
                </div>
              </DialogHeader>

              <div className="mt-6">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-semibold">Line Item Details</h3>
                  <div className="w-1/4 relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      className="pl-8"
                      value={lineItemSearch}
                      onChange={(e) => setLineItemSearch(e.target.value)}
                    />
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
                      {filteredLineItems.length > 0 ? (
                        filteredLineItems.map((item, index) => (
                          <TableRow key={item.id || index}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell>{item.collectionBrand}</TableCell>
                            <TableCell>{item.serialNo || "NA"}</TableCell>
                            <TableCell>{Number(item.quantity || 0).toFixed(2)}</TableCell>
                            <TableCell>{item.room}</TableCell>
                            <TableCell>{item.salesDescription}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">NEW</Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            No line items found.
                          </TableCell>
                        </TableRow>
                      )}
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
                      <Input
                        placeholder="Search..."
                        className="pl-8"
                        value={vasSearch}
                        onChange={(e) => setVasSearch(e.target.value)}
                      />
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
                        {filteredVasItems.length > 0 ? (
                          filteredVasItems.map((vas, index) => {
                            const amount = (Number(vas.rate) || 0) * (Number(vas.quantity) || 0);
                            const taxAmount = amount * 0.05;
                            return (
                              <TableRow key={`vas-${index}`}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>{vas.vasName}</TableCell>
                                <TableCell>NA</TableCell>
                                <TableCell>{Number(vas.quantity).toFixed(2)}</TableCell>
                                <TableCell>{Number(vas.rate).toFixed(2)}</TableCell>
                                <TableCell>{vas.room || "-"}</TableCell>
                                <TableCell>{amount.toFixed(2)}</TableCell>
                                <TableCell>0.00</TableCell>
                                <TableCell>{taxAmount.toFixed(2)}</TableCell>
                              </TableRow>
                            );
                          })
                        ) : (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center text-muted-foreground">
                              No VAS items found.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>

            <div className="hidden">
              {productOnlyQuotation && (
                <div id={`print-quotation-dialog-${quotation.id}-default`}>
                  <PrintableQuotationProfessional
                    type="GOODS"
                    values={productOnlyQuotation}
                    customer={customer}
                    creatorName={creatorName}
                    salesmanName={representativeName}
                  />
                </div>
              )}
              {vasOnlyQuotation && (
                <div id={`print-quotation-dialog-${quotation.id}-vas`}>
                  <PrintableQuotationProfessional
                    type="VAS"
                    values={vasOnlyQuotation}
                    customer={customer}
                    creatorName={creatorName}
                    salesmanName={representativeName}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="p-8 text-sm text-muted-foreground">Loading quotation details...</div>
        )}

        <DialogFooter className="bg-muted p-4">
          {onEdit && (
            <Button onClick={onEdit}>
              Edit Quotation
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
