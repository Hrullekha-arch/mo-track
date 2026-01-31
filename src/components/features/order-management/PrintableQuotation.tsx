
"use client";

import { Quotation } from "@/lib/types";
import { format } from "date-fns";
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

interface PrintableQuotationProps {
    values: Quotation;
}

const parseDate = (date: any): Date => {
    if (date instanceof Date) return date;
    if (date && date._seconds) { 
        return new Date(date._seconds * 1000 + (date._nanoseconds || 0) / 1000000);
    }
    if (typeof date === 'string' || typeof date === 'number') {
        const parsed = new Date(date);
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }
    }
    return new Date();
}

const formatToINR = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
};

export function PrintableQuotation({ values }: PrintableQuotationProps) {
    const validDate = parseDate(values.date);

    const calculation = values.items.reduce((acc, item) => {
        const rate = Number((item as any).exclusiveRate ?? item.rate) || 0;
        const itemAmount = (Number(item.quantity) || 0) * rate;
        const discountAmount = itemAmount * ((Number(item.discountPercent) || 0) / 100);
        const subtotal = itemAmount - discountAmount;
        acc.total += subtotal;
        return acc;
    }, { total: 0 });

    const vasTotal = (values.vasDetails || []).reduce((sum, vas) => {
        const rate = Number((vas as any).exclusiveRate ?? vas.rate) || 0;
        return sum + (rate * (Number(vas.quantity) || 0));
    }, 0);
    const grandTotal = calculation.total + vasTotal;

    return (
        <div className="p-8 bg-white text-black font-sans text-sm">
            <Card>
                <CardHeader>
                    <CardTitle>Quotation</CardTitle>
                    <CardDescription>
                        Quotation for {values.customerName} - {format(validDate, "PPP")}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <div className="grid grid-cols-2 gap-4 mb-4">
                        <div><strong>Quotation No:</strong> {values.quotationNo}</div>
                        <div><strong>Store:</strong> {values.store}</div>
                        <div><strong>Deal Name:</strong> {values.dealName}</div>
                    </div>
                    <Separator className="my-4" />
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">Rate</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {values.items.map((item, index) => {
                                const rate = Number((item as any).exclusiveRate ?? item.rate) || 0;
                                const amount = rate * (item.quantity || 0);
                                return (
                                    <TableRow key={item.id || index}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell>{item.salesDescription}</TableCell>
                                        <TableCell className="text-right">{item.quantity}</TableCell>
                                        <TableCell className="text-right">{formatToINR(rate)}</TableCell>
                                        <TableCell className="text-right">{formatToINR(amount)}</TableCell>
                                    </TableRow>
                                );
                            })}
                            {(values.vasDetails || []).map((vas, index) => {
                                const rate = Number((vas as any).exclusiveRate ?? vas.rate) || 0;
                                const amount = rate * (Number(vas.quantity) || 0);
                                return (
                                    <TableRow key={`vas-${index}`}>
                                        <TableCell>{values.items.length + index + 1}</TableCell>
                                        <TableCell>{vas.vasName}</TableCell>
                                        <TableCell className="text-right">{vas.quantity}</TableCell>
                                        <TableCell className="text-right">{formatToINR(rate)}</TableCell>
                                        <TableCell className="text-right">{formatToINR(amount)}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                <TableCell colSpan={4} className="text-right font-bold">Total Amount</TableCell>
                                <TableCell className="text-right font-bold">{formatToINR(grandTotal)}</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
