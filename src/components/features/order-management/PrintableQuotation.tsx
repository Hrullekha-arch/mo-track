
"use client";

import { Quotation } from "@/lib/types";
import { format } from "date-fns";
import Image from 'next/image';

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
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
};


export function PrintableQuotation({ values }: PrintableQuotationProps) {
    const validDate = parseDate(values.date);

    const calculation = values.items.reduce((acc, item) => {
        const itemAmount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
        const discountAmount = itemAmount * ((Number(item.discountPercent) || 0) / 100);
        const taxableAmount = itemAmount - discountAmount;
        acc.totalTaxableAmount += taxableAmount;
        return acc;
    }, { totalTaxableAmount: 0 });
    
    const vasTotal = (values.vasDetails || []).reduce((sum, vas) => sum + ((Number(vas.rate) || 0) * (Number(vas.quantity) || 0)), 0);
    const finalTaxableAmount = calculation.totalTaxableAmount + vasTotal;
    const taxAmount = finalTaxableAmount * 0.05; // Assuming a flat 5% tax
    const grandTotal = finalTaxableAmount + taxAmount;
    const roundedTotal = Math.round(grandTotal);
    const roundOff = roundedTotal - grandTotal;

    return (
        <div style={{ fontFamily: 'sans-serif', fontSize: '12px', color: '#333', width: '210mm', height: '297mm', padding: '1cm', boxSizing: 'border-box' }}>
            <style>
                {`
                @media print {
                    body { -webkit-print-color-adjust: exact; }
                    .print-container { page-break-after: always; }
                }
                `}
            </style>
            <div className="print-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>MO DESIGNS PRIVATE LIMITED</h1>
                        <p style={{ margin: 0, maxWidth: '400px', lineHeight: '1.4' }}>
                           A-6, Sushant Lok-1, M G Road, Gurgaon- 122022,B-50, Sushant Lok-2, Sec- 56, Gurgaon - 122011 GURGAON - (HARYANA) INDIA
                           <br />
                           GSTIN: 06AAMCM5012B1ZY, PAN No: AAMCM5012B
                           <br />
                           Email Id: info@mofurnishings.com, Contact No: 0124-4777888
                        </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <Image src="/logo.png" alt="MoTrack Logo" width={100} height={50} data-ai-hint="logo" />
                        <p style={{ margin: '5px 0 0 0' }}>Quotation #{values.quotationNo}</p>
                        <p style={{ margin: '2px 0 0 0' }}>Date: {format(validDate, "dd/MM/yyyy")}</p>
                        <p style={{ margin: '2px 0 0 0' }}>Salesman: {values.items[0]?.collectionBrand || 'N/A'}</p>
                         <p style={{ margin: '2px 0 0 0' }}>Created By: HIMANSHU</p>
                    </div>
                </div>

                <div style={{ marginTop: '20px' }}>
                    <p style={{ margin: 0 }}><span style={{fontWeight: 'bold'}}>To,</span></p>
                    <p style={{ margin: '2px 0 0 0' }}>{values.customerName}</p>
                     <p style={{ margin: '2px 0 0 0' }}>GURGAON</p>
                     <p style={{ margin: '2px 0 0 0' }}>Contact No: {/* Placeholder */}</p>
                     <p style={{ margin: '2px 0 0 0' }}>GSTIN: {/* Placeholder */}</p>
                </div>
                
                 <div style={{ marginTop: '20px' }}>
                     <p>Dear Sir/Madam,</p>
                     <p>Thank you for considering us as your furnishing partner. We look forward to your business and promise you our best services. We are here pleased to submit our Quotation, which is as follows:-</p>
                </div>


                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px', fontSize: '11px' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f2f2f2', fontWeight: 'bold' }}>
                            <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left' }}>#</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left' }}>HSN</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left', width: '30%' }}>Particulars</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>Qty</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left' }}>UOM</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>Rate</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>Amount</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>Disc.</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>Tax (%)</th>
                            <th style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {values.items.map((item, index) => {
                             const itemAmount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
                             const discountAmount = itemAmount * ((Number(item.discountPercent) || 0) / 100);
                             const taxableValue = itemAmount - discountAmount;
                             const tax = taxableValue * 0.05; // Assuming 5% tax
                             const finalAmount = taxableValue + tax;
                            return (
                                <tr key={index}>
                                    <td style={{ border: '1px solid #ddd', padding: '6px' }}>{index + 1}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px' }}>{/* HSN Placeholder */}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px' }}>{item.salesDescription}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>{Number(item.quantity).toFixed(2)}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px' }}>MTRS</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>{formatToINR(item.rate || 0)}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>{formatToINR(itemAmount)}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>{formatToINR(discountAmount)}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>5.00%</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>{formatToINR(finalAmount)}</td>
                                </tr>
                            );
                        })}
                         {(values.vasDetails || []).map((vas, index) => {
                             const totalAmount = (Number(vas.rate) || 0) * (Number(vas.quantity) || 0);
                             const tax = totalAmount * 0.05;
                             const finalAmount = totalAmount + tax;
                            return (
                                <tr key={`vas-${index}`}>
                                    <td style={{ border: '1px solid #ddd', padding: '6px' }}>{values.items.length + index + 1}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px' }}>{/* HSN */}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px' }}>{vas.vasName}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>{vas.quantity}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px' }}>PCS</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>{formatToINR(Number(vas.rate))}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>{formatToINR(totalAmount)}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>0.00</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>5.00%</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>{formatToINR(finalAmount)}</td>
                                </tr>
                            )
                         })}
                        <tr>
                            <td colSpan={6} style={{ border: '1px solid #ddd', padding: '6px', fontWeight: 'bold', textAlign: 'right' }}>Subtotal</td>
                            <td style={{ border: '1px solid #ddd', padding: '6px', fontWeight: 'bold', textAlign: 'right' }}>{formatToINR(finalTaxableAmount)}</td>
                            <td colSpan={2}></td>
                            <td style={{ border: '1px solid #ddd', padding: '6px', fontWeight: 'bold', textAlign: 'right' }}>{formatToINR(roundedTotal)}</td>
                        </tr>
                    </tbody>
                </table>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                    <div>
                        <p style={{fontWeight: 'bold'}}>MO DESIGNS PRIVATE LIMITED</p>
                        <p>BANK DETAILS - HDFC BANK LTD,SECTOR-56, HUDA DISTRICT<br/>CENTRE, GURGAON-122001 HARYANA</p>
                        <p>Acc.No. - 50200094305041,IFSC - HDFC0003871</p>
                        <p style={{marginTop: '20px'}}>ADVANCE - 0 ₹</p>
                    </div>
                    <div style={{width: '250px'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between'}}><p>Sub Total Amount</p> <p>{formatToINR(finalTaxableAmount)}</p></div>
                        <div style={{display: 'flex', justifyContent: 'space-between'}}><p>Total Discount</p> <p>0.00</p></div>
                        <div style={{display: 'flex', justifyContent: 'space-between'}}><p>Total Tax Amount</p> <p>{formatToINR(taxAmount)}</p></div>
                        <div style={{display: 'flex', justifyContent: 'space-between'}}><p>Round Off</p> <p>{formatToINR(roundOff)}</p></div>
                        <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderTop: '1px solid #333', paddingTop: '5px'}}><p>Total Amount</p> <p>{formatToINR(roundedTotal)}</p></div>
                    </div>
                </div>

                <div style={{ borderTop: '1px solid #ccc', marginTop: '50px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                        <p style={{fontWeight: 'bold'}}>Terms and Conditions</p>
                    </div>
                     <div style={{textAlign: 'right'}}>
                        <p style={{fontWeight: 'bold'}}>Authorised Signatory</p>
                    </div>
                </div>

            </div>
        </div>
    );
}

