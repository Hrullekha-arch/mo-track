
"use client";

import * as React from "react";
import { Quotation, QuotationItem, VasDetail } from "@/lib/types";
import { format } from "date-fns";
import Image from 'next/image';

interface PrintableQuotationProps {
    values: Quotation;
    creatorName?: string;
    salesmanName?: string;
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
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
};

interface CalculatedItem extends QuotationItem {
    amount: number;
    discountAmount: number;
    taxableAmount: number;
    taxAmount: number;
    finalAmount: number;
    taxRate: number;
}

interface CalculatedVas extends VasDetail {
    amount: number;
    taxableAmount: number;
    taxAmount: number;
    finalAmount: number;
    taxRate: number;
}

export function PrintableQuotationProfessional({ values, creatorName, salesmanName }: PrintableQuotationProps) {
    const validDate = parseDate(values.date);

    const calculatedItems = (values.items || []).map(item => {
        const amount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
        const discountAmount = amount * ((Number(item.discountPercent) || 0) / 100);
        const taxableAmount = amount - discountAmount;
        const taxRate = 5; // Assuming 5% tax for all items for now
        const taxAmount = taxableAmount * (taxRate / 100);
        const finalAmount = taxableAmount + taxAmount;
        return { ...item, amount, discountAmount, taxableAmount, taxAmount, finalAmount, taxRate };
    });

    const calculatedVas = (values.vasDetails || []).map(vas => {
        const amount = (Number(vas.quantity) || 0) * (Number(vas.rate) || 0);
        const taxableAmount = amount;
        const taxRate = 5; // Assuming 5% tax
        const taxAmount = taxableAmount * (taxRate / 100);
        const finalAmount = taxableAmount + taxAmount;
        return { ...vas, amount, taxableAmount, taxAmount, finalAmount, taxRate };
    });
    
    const allItems = [...calculatedItems, ...calculatedVas];

    const groupedItems = allItems.reduce((acc, item) => {
        const room = item.room || 'General Items';
        if (!acc[room]) {
            acc[room] = [];
        }
        acc[room].push(item);
        return acc;
    }, {} as Record<string, (CalculatedItem | CalculatedVas)[]>);

    const totals = allItems.reduce((acc, item) => {
        acc.subTotalAmount += item.amount;
        acc.totalDiscount += (item as CalculatedItem).discountAmount || 0;
        acc.totalTaxAmount += item.taxAmount;
        acc.totalAmount += item.finalAmount;
        return acc;
    }, { subTotalAmount: 0, totalDiscount: 0, totalTaxAmount: 0, totalAmount: 0 });
    
    const roundedTotal = Math.round(totals.totalAmount);
    const roundOff = roundedTotal - totals.totalAmount;

    return (
        <div style={{ width: '210mm', minHeight: '297mm', margin: 'auto', padding: '2rem 1.5rem', backgroundColor: 'white', color: 'black', fontFamily: 'Arial, sans-serif', fontSize: '12px' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #333', paddingBottom: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Quotation</h1>
                    <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0.5rem 0 0.25rem' }}>MO DESIGNS PRIVATE LIMITED</h2>
                    <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.4 }}>
                        A-6, Sushant Lok-1, M G Road, Gurgaon- 122022,B-50, Sushant Lok-2, Sec- 56,<br />
                        Gurgaon - 122011 GURGAON - (HARYANA) INDIA<br />
                        GSTIN: 06AAMCM5012B1ZY, PAN No: AAMCM5012B,<br />
                        Email Id : info@mofurnishings.com, Contact No: 0124-4777888
                    </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <Image src="/logo.png" alt="Mo Logo" width={120} height={60} style={{ marginBottom: '1rem' }} />
                    <p style={{ margin: 0 }}><strong>Quotation #</strong>{values.quotationNo}</p>
                    <p style={{ margin: '0.25rem 0' }}><strong>Date:</strong> {format(validDate, "dd/MM/yyyy")}</p>
                    <p style={{ margin: 0 }}><strong>Salesman:</strong> {salesmanName || 'N/A'}</p>
                    <p style={{ margin: '0.25rem 0' }}><strong>Created By:</strong> {creatorName || 'N/A'}</p>
                </div>
            </header>

            <section style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', fontSize: '11px' }}>
                <div>
                    <h3 style={{ margin: '0 0 0.25rem', fontWeight: 'bold' }}>To,</h3>
                    <p style={{ margin: 0, fontWeight: 'bold' }}>{values.customerName}</p>
                    <p style={{ margin: '0.25rem 0' }}>{values.billingAddress || 'N/A'}</p>
                    <p style={{ margin: 0 }}><strong>Contact No:</strong> {/* Placeholder */}</p>
                    <p style={{ margin: '0.25rem 0' }}><strong>GSTIN:</strong> {/* Placeholder */}</p>
                </div>
            </section>
            
            <section style={{ marginTop: '1rem', fontSize: '11px' }}>
                 <p>Dear Sir/Madam,</p>
                 <p>Thank you for considering us as your furnishing partner. We look forward to your business and promise you our best services. We are here pleased to submit our Quotation, which is as follows:-</p>
            </section>

            <main style={{ marginTop: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f2f2f2', border: '1px solid #ddd' }}>
                            <th style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'left' }}>#</th>
                            <th style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'left' }}>HSN</th>
                            <th style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'left' }}>Particulars</th>
                            <th style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>Qty</th>
                            <th style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'left' }}>UOM</th>
                            <th style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>Rate</th>
                            <th style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>Amount</th>
                            <th style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>Disc.</th>
                            <th style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>Tax (%)</th>
                            <th style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(groupedItems).map(([room, itemsInRoom], roomIndex) => (
                            <React.Fragment key={room}>
                                <tr style={{ backgroundColor: '#e9e9e9' }}>
                                    <td colSpan={10} style={{ padding: '4px 6px', fontWeight: 'bold' }}>{roomIndex + 1}. {room.toUpperCase()}</td>
                                </tr>
                                {itemsInRoom.map((item, itemIndex) => (
                                     <tr key={item.id || `vas-${itemIndex}`}>
                                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>{itemIndex + 1}</td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>{/* HSN Placeholder */}</td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>{'vasName' in item ? item.vasName : item.collectionBrand}</td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>{Number(item.quantity).toFixed(2)}</td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'left' }}>MTRS</td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(Number(item.rate))}</td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(item.amount)}</td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR((item as CalculatedItem).discountAmount || 0)}<br/>@{((item as CalculatedItem).discountPercent || 0).toFixed(2)}%</td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>{item.taxRate.toFixed(2)}%</td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(item.finalAmount)}</td>
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr style={{ fontWeight: 'bold' }}>
                            <td colSpan={9} style={{ padding: '6px', textAlign: 'right' }}>Subtotal</td>
                            <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(totals.subTotalAmount)}</td>
                        </tr>
                        <tr style={{ fontWeight: 'bold', backgroundColor: '#f2f2f2' }}>
                            <td colSpan={9} style={{ padding: '6px', textAlign: 'right', borderTop: '2px solid #333' }}>Total Amount</td>
                            <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right', borderTop: '2px solid #333' }}>{formatToINR(totals.totalAmount)}</td>
                        </tr>
                    </tfoot>
                </table>
            </main>

            <footer style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #333', paddingTop: '1rem' }}>
                <div style={{ fontSize: '11px' }}>
                    <p style={{ margin: 0, fontWeight: 'bold' }}>MO DESIGNS PRIVATE LIMITED</p>
                    <p style={{ margin: '0.25rem 0' }}>BANK DETAILS - HDFC BANK LTD,SECTOR-56, HUDA DISTRICT<br/>CENTRE, GURGAON-122001 HARYANA</p>
                    <p style={{ margin: 0 }}>Acc.No. - 50200094305041,IFSC - HDFC0003871</p>
                    <p style={{ marginTop: '1rem', fontWeight: 'bold' }}>ADVANCE - 0 ₹</p>
                </div>
                <div style={{ width: '40%', fontSize: '11px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #ddd' }}>
                        <span>Sub Total Amount</span>
                        <span style={{ fontWeight: 'bold' }}>{formatToINR(totals.subTotalAmount)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #ddd' }}>
                        <span>Total Discount</span>
                        <span style={{ fontWeight: 'bold' }}>{formatToINR(totals.totalDiscount)}</span>
                    </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #ddd' }}>
                        <span>Total Tax Amount</span>
                        <span style={{ fontWeight: 'bold' }}>{formatToINR(totals.totalTaxAmount)}</span>
                    </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #ddd' }}>
                        <span>Round Off</span>
                        <span style={{ fontWeight: 'bold' }}>{formatToINR(roundOff)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: 'bold' }}>
                        <span>Total Amount</span>
                        <span>{formatToINR(roundedTotal)}</span>
                    </div>
                </div>
            </footer>
             <section style={{ marginTop: '1rem', borderTop: '1px solid #ddd', paddingTop: '0.5rem', fontSize: '10px' }}>
                <p style={{ fontWeight: 'bold', margin: '0 0 0.5rem' }}>Terms and Conditions</p>
                <p style={{ margin: 0 }}>{/* Placeholder for Terms and Conditions */}</p>
            </section>
             <section style={{ marginTop: '3rem', textAlign: 'right', fontSize: '12px' }}>
                <p style={{ fontWeight: 'bold' }}>Authorised Signatory</p>
            </section>
        </div>
    );
}
