
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { FormValues } from "./CreateQuotationDialog";
import { format } from "date-fns";

interface QuotationPreviewProps {
    values: FormValues;
}

// Function to convert number to Indian currency format
const formatToINR = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
};

export function QuotationPreview({ values }: QuotationPreviewProps) {
    
    const calculation = values.items.reduce((acc, item) => {
        const itemAmount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
        const discountAmount = itemAmount * ((Number(item.discountPercent) || 0) / 100);
        const taxableAmount = itemAmount - discountAmount;

        acc.subtotal += itemAmount;
        acc.totalDiscount += discountAmount;
        acc.totalTaxableAmount += taxableAmount;

        return acc;
    }, { subtotal: 0, totalDiscount: 0, totalTaxableAmount: 0 });
    
    const cgst = calculation.totalTaxableAmount * 0.09; // 9%
    const sgst = calculation.totalTaxableAmount * 0.09; // 9%
    const grandTotal = calculation.totalTaxableAmount + cgst + sgst;

    return (
        <div className="p-8 bg-white text-black font-sans text-sm">
            <header className="text-center mb-8">
                <h1 className="text-2xl font-bold">Quotation</h1>
                <p className="text-muted-foreground">{values.company || "Mo Design"}</p>
            </header>
            
            <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                    <h2 className="font-bold mb-2">Customer Details:</h2>
                    <p>{values.customerName}</p>
                    <p>{/* Placeholder for Address */}</p>
                    <p>{/* Placeholder for Phone */}</p>
                </div>
                 <div className="text-right">
                    <p><span className="font-bold">Quotation No:</span> {/* Placeholder */}</p>
                    <p><span className="font-bold">Date:</span> {format(values.date, "PPP")}</p>
                    <p><span className="font-bold">Store:</span> {values.store}</p>
                </div>
            </div>

            <main>
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted">
                            <TableHead className="w-10">S.No.</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Quantity</TableHead>
                            <TableHead className="text-right">Rate</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Discount</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {values.items.map((item, index) => {
                            const itemAmount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
                            const discountAmount = itemAmount * ((Number(item.discountPercent) || 0) / 100);
                            const subtotal = itemAmount - discountAmount;
                            return (
                                <TableRow key={item.id}>
                                    <TableCell>{index + 1}</TableCell>
                                    <TableCell>{item.description}</TableCell>
                                    <TableCell className="text-right">{item.quantity}</TableCell>
                                    <TableCell className="text-right">{formatToINR(item.rate || 0)}</TableCell>
                                    <TableCell className="text-right">{formatToINR(itemAmount)}</TableCell>
                                    <TableCell className="text-right">{formatToINR(discountAmount)}</TableCell>
                                    <TableCell className="text-right font-semibold">{formatToINR(subtotal)}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </main>
            
             <Separator className="my-8" />
             
            <div className="grid grid-cols-2 gap-8">
                <div>
                    <h3 className="font-bold mb-2">Terms & Conditions</h3>
                    <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
                        <li>50% advance payment required.</li>
                        <li>Goods once sold will not be taken back.</li>
                        <li>Delivery within 15-20 working days.</li>
                    </ul>
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal:</span>
                        <span className="font-semibold">{formatToINR(calculation.subtotal)}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">Discount:</span>
                        <span className="font-semibold">{formatToINR(calculation.totalDiscount)}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">Taxable Amount:</span>
                        <span className="font-semibold">{formatToINR(calculation.totalTaxableAmount)}</span>
                    </div>
                    <Separator />
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">CGST @9%:</span>
                        <span className="font-semibold">{formatToINR(cgst)}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">SGST @9%:</span>
                        <span className="font-semibold">{formatToINR(sgst)}</span>
                    </div>
                    <Separator />
                     <div className="flex justify-between text-lg font-bold">
                        <span>Grand Total:</span>
                        <span>{formatToINR(grandTotal)}</span>
                    </div>
                </div>
            </div>
            
             <footer className="mt-16 text-center">
                <p className="font-semibold">Thank you for your business!</p>
                <p className="text-xs text-muted-foreground">This is a computer-generated quotation.</p>
            </footer>
        </div>
    );
}

