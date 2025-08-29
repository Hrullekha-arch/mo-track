
"use client";

import * as React from "react";
import { Invoice, InvoiceBatch, Order, Stock, TaxDetail } from "@/lib/types";
import { format } from "date-fns";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import Image from 'next/image';

interface PrintableInvoiceProps {
    batches: InvoiceBatch[];
    orders: Order[];
    preGeneratedInvoiceNo?: string | null;
}

const formatToINR = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
};

// A simple number to words converter for demonstration
const numberToWords = (num: number): string => {
    const a = ['','one ','two ','three ','four ', 'five ','six ','seven ','eight ','nine ','ten ','eleven ','twelve ','thirteen ','fourteen ','fifteen ','sixteen ','seventeen ','eighteen ','nineteen '];
    const b = ['', '', 'twenty','thirty','forty','fifty', 'sixty','seventy','eighty','ninety'];
    const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    let str = '';
    str += (n[1] != '00') ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'crore ' : '';
    str += (n[2] != '00') ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'lakh ' : '';
    str += (n[3] != '00') ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'thousand ' : '';
    str += (n[4] != '0') ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'hundred ' : '';
    str += (n[5] != '00') ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
    return str.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

const parseDateSafe = (dateInput: any): Date => {
    if (!dateInput) return new Date();
    if (dateInput instanceof Date) return dateInput;
    // Handle Firestore Timestamp object which has toDate() method
    if (typeof dateInput.toDate === 'function') {
        return dateInput.toDate();
    }
    // Handle ISO string
    if (typeof dateInput === 'string') {
        const date = new Date(dateInput);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    return new Date(); // Fallback
}

export function PrintableInvoice({ batches, orders, preGeneratedInvoiceNo = null }: PrintableInvoiceProps) {
    const [stockDetails, setStockDetails] = React.useState<Record<string, Stock>>({});
    const [taxDetails, setTaxDetails] = React.useState<Record<string, TaxDetail>>({});
    const [invoiceDetails, setInvoiceDetails] = React.useState<Invoice | null>(null);
    const [logoSrc, setLogoSrc] = React.useState<string | null>(null);

    // Assuming we are generating an invoice for the first selected batch/order
    const primaryBatch = batches[0];
    const primaryOrder = orders.find(o => o.id === primaryBatch?.orderId);

    React.useEffect(() => {
        // Set the absolute URL for the logo on the client side
        setLogoSrc(`${window.location.origin}/logo.png`);

        const fetchDetails = async () => {
            if (!primaryBatch) return;

            const allItems = batches.flatMap(b => b.items);
            const uniqueBcns = [...new Set(allItems.map(item => item.bcn))];
            const newStockDetails: Record<string, Stock> = {};
            const newTaxDetails: Record<string, TaxDetail> = {};
            const hsnCodes = new Set<string>();

            for (const bcn of uniqueBcns) {
                const stockId = bcn.replace(/\//g, '-');
                const stockRef = doc(db, 'stocks', stockId);
                const stockSnap = await getDoc(stockRef);
                if (stockSnap.exists()) {
                    const stockData = stockSnap.data() as Stock;
                    newStockDetails[bcn] = stockData;
                    if(stockData.hsnCode) hsnCodes.add(stockData.hsnCode);
                }
            }
            setStockDetails(newStockDetails);
            
            if (hsnCodes.size > 0) {
                const taxQuery = query(collection(db, 'taxDetails'), where('hsnCode', 'in', Array.from(hsnCodes)));
                const taxSnaps = await getDocs(taxQuery);
                taxSnaps.forEach(taxDoc => {
                    newTaxDetails[taxDoc.id] = taxDoc.data() as TaxDetail;
                });
                setTaxDetails(newTaxDetails);
            }

            // Fetch the invoice document to get the invoiceNo
            const invoiceIdToFetch = primaryBatch.invoiceId || (primaryBatch as unknown as Invoice).id;
            if (invoiceIdToFetch) {
                const invoiceRef = doc(db, 'invoices', invoiceIdToFetch);
                const invoiceSnap = await getDoc(invoiceRef);
                if (invoiceSnap.exists()) {
                    setInvoiceDetails(invoiceSnap.data() as Invoice);
                }
            }
        };
        
        if(batches.length > 0) {
            fetchDetails();
        }
    }, [batches, primaryBatch]);
    
    if (!primaryBatch || !primaryOrder) {
        return <div className="p-8">Select an order to generate an invoice.</div>;
    }
    
    const isVasInvoice = primaryBatch.isVas === true;

    const consolidatedItems = batches
        .flatMap(b => b.items)
        .reduce((acc, item) => {
            const key = item.bcn;
            if (!acc[key]) {
                acc[key] = { ...item, quantityAllocated: 0 };
            }
            acc[key].quantityAllocated += item.quantityAllocated;
            return acc;
        }, {} as Record<string, typeof primaryBatch.items[0]>);

    const consolidatedItemList = Object.values(consolidatedItems);

    const totals = consolidatedItemList.reduce((acc, item) => {
        const stock = stockDetails[item.bcn];
        const tax = taxDetails[stock?.hsnCode || ''];
        const cgstRate = (tax?.cgst || (isVasInvoice ? 9 : 2.5)) / 100;
        const sgstRate = (tax?.sgst || (isVasInvoice ? 9 : 2.5)) / 100;
        
        const qty = item.quantityAllocated;
        const rate = item.rate;
        const amount = qty * rate;
        const discountAmount = amount * ((item.discountPercent || 0) / 100);
        const taxableValue = amount - discountAmount;
        const cgst = taxableValue * cgstRate;
        const sgst = taxableValue * sgstRate;
        
        acc.totalQty += qty;
        acc.totalAmount += amount;
        acc.totalDiscount += discountAmount;
        acc.totalValue += taxableValue;
        acc.totalCgst += cgst;
        acc.totalSgst += sgst;
        
        return acc;
    }, { totalQty: 0, totalAmount: 0, totalDiscount: 0, totalValue: 0, totalCgst: 0, totalSgst: 0 });

    const netAmount = totals.totalValue + totals.totalCgst + totals.totalSgst;
    const roundedAmount = Math.round(netAmount);
    const roundOff = roundedAmount - netAmount;

    return (
        <div style={{ width: '210mm', minHeight: '297mm', margin: 'auto', padding: '1rem', backgroundColor: 'white', color: 'black', fontFamily: 'Arial, sans-serif', fontSize: '10px' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid black', paddingBottom: '0.5rem' }}>
                 <div style={{ flex: '0 0 120px' }}>
                    {logoSrc && (
                        <Image
                            src={logoSrc} 
                            alt="MoTrack Logo" 
                            width={100}
                            height={50}
                            style={{ width: '100px', height: 'auto' }} 
                        />
                    )}
                 </div>
                <div style={{ flex: '1', textAlign: 'center' }}>
                    <h1 style={{ fontSize: '14px', fontWeight: 'bold', margin: 0, borderBottom: '1px solid black', paddingBottom: '4px' }}>TAX INVOICE</h1>
                    <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0.5rem 0 0.25rem' }}>{isVasInvoice ? 'MO SPACES PVT.LTD' : 'MO DESIGNS PRIVATE LIMITED'}</h2>
                    <p style={{ margin: 0, fontSize: '10px' }}>
                        A6 SUSHANT LOK 1, M G ROAD, GURGAON<br />
                        GURGAON-122002 (HARYANA) INDIA
                    </p>
                </div>
                 <div style={{ flex: '0 0 120px' }}></div>
            </header>
            
            <section style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid black', borderBottom: '1px solid black', padding: '0.5rem 0' }}>
                <div style={{ width: '60%'}}>
                    <p style={{ margin: 0 }}><strong>Billing Address</strong></p>
                    <p style={{ margin: '2px 0', fontWeight: 'bold' }}>{primaryOrder.customerName}</p>
                    <p style={{ margin: '2px 0' }}>{primaryOrder.customerAddress}</p>
                    <p style={{ margin: '2px 0' }}>Phone No: {primaryOrder.customerPhone}</p>
                    <p style={{ margin: '2px 0' }}>GSTIN: Buyer's PAN No. -</p>
                </div>
                <div style={{ width: '38%', border: '1px solid black' }}>
                    <div style={{ display: 'flex', borderBottom: '1px solid black' }}><p style={{width: '50%', margin: '2px 4px'}}>Date</p><p style={{width: '50%', margin: '2px 4px', borderLeft: '1px solid black'}}><strong>{format(parseDateSafe(primaryBatch.createdAt), 'dd/MM/yyyy')}</strong></p></div>
                    <div style={{ display: 'flex', borderBottom: '1px solid black' }}><p style={{width: '50%', margin: '2px 4px'}}>Date</p><p style={{width: '50%', margin: '2px 4px', borderLeft: '1px solid black'}}><strong>{format(parseDateSafe(primaryBatch.createdAt), 'dd/MM/yyyy')}</strong></p></div>
                    <div style={{ display: 'flex', borderBottom: '1px solid black' }}><p style={{width: '50%', margin: '2px 4px'}}>Invoice No</p><p style={{width: '50%', margin: '2px 4px', borderLeft: '1px solid black'}}><strong>{preGeneratedInvoiceNo || invoiceDetails?.invoiceNo || 'N/A'}</strong></p></div>
                    <div style={{ display: 'flex', borderBottom: '1px solid black' }}><p style={{width: '50%', margin: '2px 4px'}}>Architect</p><p style={{width: '50%', margin: '2px 4px', borderLeft: '1px solid black'}}><strong>{/* Placeholder */}</strong></p></div>
                    <div style={{ display: 'flex' }}><p style={{width: '50%', margin: '2px 4px'}}>Sales Representative</p><p style={{width: '50%', margin: '2px 4px', borderLeft: '1px solid black'}}><strong>{primaryOrder.salesPerson}</strong></p></div>
                </div>
            </section>
            
             <main style={{ marginTop: '0.5rem', border: '1px solid black' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f2f2f2' }}>
                            <th style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'left', width: '3%' }}>Sr No</th>
                            <th style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'left', width: '25%' }}>Collection / Brand - Serial No</th>
                            <th style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'left', width: '8%' }}>HSN</th>
                            <th style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right', width: '8%' }}>Qty</th>
                            <th style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'left', width: '8%' }}>Rate</th>
                            <th style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right', width: '10%' }}>Amt</th>
                            <th style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right', width: '10%' }}>Disc.</th>
                            <th style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right', width: '10%' }}>Value</th>
                            <th style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right', width: '6%' }}>CGST</th>
                            <th style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right', width: '6%' }}>SGST</th>
                            <th style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right', width: '6%' }}>IGST</th>
                        </tr>
                    </thead>
                    <tbody>
                       {consolidatedItemList.map((item, index) => {
                           const qty = item.quantityAllocated;
                           const rate = item.rate;
                           const amount = qty * rate;
                           const discountAmount = amount * ((item.discountPercent || 0) / 100);
                           const taxableValue = amount - discountAmount;
                           const stock = stockDetails[item.bcn];
                           const tax = taxDetails[stock?.hsnCode || ''];
                           const cgstRate = (tax?.cgst || (isVasInvoice ? 9 : 2.5)) / 100;
                           const sgstRate = (tax?.sgst || (isVasInvoice ? 9 : 2.5)) / 100;
                           const cgst = taxableValue * cgstRate;
                           const sgst = taxableValue * sgstRate;

                           return (
                               <tr key={index}>
                                   <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'center' }}>{index + 1}</td>
                                   <td style={{ padding: '4px', border: '1px solid #ddd' }}>{item.itemName}<br/><strong>{item.bcn}</strong></td>
                                   <td style={{ padding: '4px', border: '1px solid #ddd' }}>{stock?.hsnCode || ''}</td>
                                   <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right' }}>{qty.toFixed(2)} MTRS</td>
                                   <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(rate)}</td>
                                   <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(amount)}</td>
                                   <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(discountAmount)}</td>
                                   <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(taxableValue)}</td>
                                   <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(cgst)}</td>
                                   <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(sgst)}</td>
                                   <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right' }}>0.00</td>
                               </tr>
                           );
                       })}
                    </tbody>
                    <tfoot>
                        <tr style={{ fontWeight: 'bold' }}>
                            <td colSpan={3} style={{ padding: '4px', textAlign: 'right' }}>Total</td>
                            <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(totals.totalQty)}</td>
                            <td style={{ padding: '4px', border: '1px solid #ddd' }}></td>
                            <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(totals.totalAmount)}</td>
                            <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(totals.totalDiscount)}</td>
                            <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(totals.totalValue)}</td>
                            <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(totals.totalCgst)}</td>
                            <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(totals.totalSgst)}</td>
                            <td style={{ padding: '4px', border: '1px solid #ddd', textAlign: 'right' }}>0.00</td>
                        </tr>
                    </tfoot>
                </table>
            </main>
            
            <footer style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid black', paddingTop: '0.5rem' }}>
                <div style={{ width: '60%' }}>
                     <p style={{ margin: '2px 0' }}><strong>Amount in Words :</strong> {numberToWords(roundedAmount)} only</p>
                     <p style={{ margin: '2px 0' }}><strong>Bank Name :</strong> HDFC BANK LTD, Account No: 50200094305041 ,</p>
                     <p style={{ margin: '2px 0' }}><strong>IFSC Code :</strong> HDFC0003871 Branch : SCO-39, SECOR-56, HUDA DISTRICT CENTRE, GURGAON-122001</p>
                     <p style={{ margin: '8px 0 2px' }}><strong>ADVANCE :</strong> 0 ₹</p>
                </div>
                 <div style={{ width: '38%', display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{width: '50%'}}>
                        <p style={{ margin: '2px 0', textAlign: 'right' }}>Subtotal</p>
                        <p style={{ margin: '2px 0', textAlign: 'right' }}>Discount</p>
                        <p style={{ margin: '2px 0', textAlign: 'right' }}>Taxable Val</p>
                        <p style={{ margin: '2px 0', textAlign: 'right' }}>CGST</p>
                        <p style={{ margin: '2px 0', textAlign: 'right' }}>SGST</p>
                        <p style={{ margin: '2px 0', textAlign: 'right' }}>Round Off</p>
                        <p style={{ margin: '2px 0', textAlign: 'right', fontWeight: 'bold' }}>Net Amount</p>
                    </div>
                    <div style={{width: '45%', textAlign: 'right'}}>
                        <p style={{ margin: '2px 0', borderBottom: '1px solid black', paddingBottom: '1px' }}>{formatToINR(totals.totalAmount)}</p>
                        <p style={{ margin: '2px 0', borderBottom: '1px solid black', paddingBottom: '1px' }}>{formatToINR(totals.totalDiscount)}</p>
                        <p style={{ margin: '2px 0', borderBottom: '1px solid black', paddingBottom: '1px' }}>{formatToINR(totals.totalValue)}</p>
                        <p style={{ margin: '2px 0', borderBottom: '1px solid black', paddingBottom: '1px' }}>{formatToINR(totals.totalCgst)}</p>
                        <p style={{ margin: '2px 0', borderBottom: '1px solid black', paddingBottom: '1px' }}>{formatToINR(totals.totalSgst)}</p>
                        <p style={{ margin: '2px 0', borderBottom: '1px solid black', paddingBottom: '1px' }}>{formatToINR(roundOff)}</p>
                        <p style={{ margin: '2px 0', fontWeight: 'bold' }}>{formatToINR(roundedAmount)}</p>
                    </div>
                 </div>
            </footer>
             <div style={{ marginTop: '1rem', borderTop: '1px solid black', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                     <p style={{ margin: '2px 0' }}><strong>Declaration</strong></p>
                     <p style={{ margin: '2px 0' }}>Reg. Office : Reg. off : A-6, Sushant Lok-I, M G Road, Gurgaon-122002,Branch: 850, Sushant Lok-II, Sec-56, Gurgaon, HARYANA, Phone No : 0124-4777888</p>
                </div>
                 <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: '2px 0', fontWeight: 'bold' }}>For {isVasInvoice ? 'MO SPACES PVT.LTD' : 'MO DESIGNS PRIVATE LIMITED'}</p>
                    <p style={{ marginTop: '2rem' }}>Authorised Signatory</p>
                </div>
            </div>
        </div>
    );
}
