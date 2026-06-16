"use client";

import * as React from "react";
import { Customer, Quotation, QuotationItem, VasDetail } from "@/lib/types";
import { format } from "date-fns";
import Image from 'next/image';

interface PrintableQuotationProps {
    type:string;
    values: Quotation;
    creatorName?: string;
    salesmanName?: string;
    customer?: Customer;
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

type BillingDetailSnapshot = {
  billingName?: string;
  billingPhone?: string;
  billingAddress?: string;
  gstin?: string;
  isDefault?: boolean;
};

const toText = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || undefined;
};

const normalizeBillingDetail = (value: unknown): BillingDetailSnapshot | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const detail: BillingDetailSnapshot = {
    billingName: toText(record.billingName),
    billingPhone: toText(record.billingPhone),
    billingAddress: toText(record.billingAddress),
    gstin: toText(record.gstin)?.toUpperCase(),
    isDefault: record.isDefault === true,
  };
  if (!detail.billingName && !detail.billingPhone && !detail.billingAddress && !detail.gstin) {
    return undefined;
  }
  return detail;
};

const resolvePreferredCustomerBillingDetail = (customer?: Customer): BillingDetailSnapshot | undefined => {
  const details = Array.isArray(customer?.billingDetails)
    ? customer.billingDetails
        .map((detail) => normalizeBillingDetail(detail))
        .filter((detail): detail is BillingDetailSnapshot => Boolean(detail))
    : [];
  if (details.length === 0) return undefined;
  return details.find((detail) => detail.isDefault) || details[0];
};

const pickFirstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = toText(value);
    if (text) return text;
  }
  return undefined;
};

interface CalculatedItem extends QuotationItem {
    amount: number;
    discountAmount: number;
    taxableAmount: number;
    taxAmount: number;
    finalAmount: number;
    taxRate: number;
    categoryGroup?: string; // ✅ Added to support the new field
}

interface CalculatedVas extends VasDetail {
    amount: number;
    taxableAmount: number;
    taxAmount: number;
    finalAmount: number;
    taxRate: number;
}

export function PrintableQuotationProfessional({ type, values, creatorName, salesmanName, customer }: PrintableQuotationProps) {
    const quotationRecord = values as Quotation & {
      billingAddress?: string;
      customerPhone?: string;
      gstin?: string;
      billingDetails?: unknown;
      customerSnapshot?: {
        name?: string;
        phone?: string;
        gstin?: string;
        address?: string;
        billingAddress?: {
          line1?: string;
        };
        billingDetails?: unknown;
      };
    };
    const quotationBillingDetails = normalizeBillingDetail(quotationRecord.billingDetails);
    const snapshotBillingDetails = normalizeBillingDetail(quotationRecord.customerSnapshot?.billingDetails);
    const customerBillingDetails = resolvePreferredCustomerBillingDetail(customer);
    const recipientName =
      pickFirstText(
        customerBillingDetails?.billingName,
        quotationBillingDetails?.billingName,
        snapshotBillingDetails?.billingName,
        values.billingName,
        quotationRecord.customerSnapshot?.name,
        values.customerName,
        customer?.name
      ) || "N/A";
    const recipientAddress =
      pickFirstText(
        customerBillingDetails?.billingAddress,
        quotationBillingDetails?.billingAddress,
        snapshotBillingDetails?.billingAddress,
        quotationRecord.billingAddress,
        quotationRecord.customerSnapshot?.billingAddress?.line1,
        quotationRecord.customerSnapshot?.address,
        customer?.billingAddress?.line1,
        customer?.addressPinCode
      ) || "N/A";
    const recipientPhone = pickFirstText(
      customerBillingDetails?.billingPhone,
      quotationBillingDetails?.billingPhone,
      snapshotBillingDetails?.billingPhone,
      quotationRecord.customerSnapshot?.phone,
      quotationRecord.customerPhone,
      customer?.phone,
      customer?.mobileNo
    );
    const recipientGstin = pickFirstText(
      customerBillingDetails?.gstin,
      quotationBillingDetails?.gstin,
      snapshotBillingDetails?.gstin,
      quotationRecord.gstin,
      quotationRecord.customerSnapshot?.gstin,
      customer?.gstin
    );
    
    const validDate = parseDate(values.date);
    const shouldApplyTax = values.applyTax !== false;

    const resolveTaxRate = (item: any) => {
        if (!shouldApplyTax) return 0;
        const fromItem = Number(item?.gstPercent ?? item?.taxPercent ?? item?.taxRate);
        if (Number.isFinite(fromItem)) return fromItem;
        return 5;
    };

    const calculatedItems = (values.items || []).map(item => {
        const taxRate = resolveTaxRate(item);
        const rawRate = Number(item.rate) || 0;
        const gstMode = (item as any)?.gstMode === "EXCL" ? "EXCL" : "INCL";
        const storedExclusive = Number((item as any)?.exclusiveRate);
        const exclusiveRate =
            Number.isFinite(storedExclusive) && storedExclusive > 0
                ? storedExclusive
                : gstMode === "EXCL" || taxRate === 0
                ? rawRate
                : rawRate / (1 + taxRate / 100);
        const amount = (Number(item.quantity) || 0) * exclusiveRate;
        const discountAmount = amount * ((Number(item.discountPercent) || 0) / 100);
        const taxableAmount = amount - discountAmount;
        const taxAmount = taxableAmount * (taxRate / 100);
        const finalAmount = taxableAmount + taxAmount;
        return { ...item, amount, discountAmount, taxableAmount, taxAmount, finalAmount, taxRate, exclusiveRate };
    });

    const calculatedVas = (values.vasDetails || []).map(vas => {
        const exclusiveRate = Number((vas as any).exclusiveRate ?? vas.rate) || 0;
        const amount = (Number(vas.quantity) || 0) * exclusiveRate;
        const taxRate = resolveTaxRate(vas);
        // VAS uses exclusive GST: add tax on top of rate
        const taxableAmount = amount;
        const taxAmount = taxableAmount * (taxRate / 100);
        const finalAmount = taxableAmount + taxAmount;
        return { ...vas, amount, taxableAmount, taxAmount, finalAmount, taxRate, exclusiveRate };
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
    const company =
  type === "GOODS"
    ? {
        name: "MO DESIGNS PRIVATE LIMITED",
        address: `A-6, M G Road,`,
        address1: `B-50, Sushant Lok-2, Sec- 56`,
        address2: `Gurgaon - 122011 (HARYANA) INDIA`,
        gst: "06AAMCM5012B1ZY",
        pan: "AAMCM5012B",
      }
    : {
        name: "SP SERVICES",
        address: `2nd Floor, B-50 (MO)`,
        address1:`Sushant Lok Phase 2, Block B, Sector 56`,
        address2:`Gurugram - 122011 (HARYANA) INDIA`,
        gst: "06CDOPP2805B1ZR",
        pan: "CDOPP2805B",
      }
    const logoSrc = type === "GOODS" ? "/name-logo.png" : "/vatLOGO.png";

    return (
        <div style={{ width: '210mm', minHeight: '297mm', margin: 'auto', padding: '2rem 1.5rem', backgroundColor: 'white', color: 'black', fontFamily: 'Arial, sans-serif', fontSize: '12px' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #333', paddingBottom: '1rem' }}>
                  <div>
                    <h1 className="text-2xl font-bold">Quotation</h1>

                    <h2 className="text-sm font-bold mt-2">{company.name}</h2>

                    <p className="text-[11px] leading-4 whitespace-pre-line">
                    {company.address}
                    <br />
                    {company.address1}
                    <br />
                    {company.address2}
                    <br />
                    GSTIN: {company.gst}, PAN No: {company.pan}
                    <br />
                    Email: info@mofurnishings.com, Contact: 0124-4777888
                    </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <Image src={logoSrc} alt="Mo Logo" width={120} height={60} style={{ marginBottom: '1rem' }} />
                    <p style={{ margin: 0 }}><strong>Quotation #</strong>{values.quotationNo}</p>
                    <p style={{ margin: '0.25rem 0' }}><strong>Date:</strong> {format(validDate, "dd/MM/yyyy")}</p>
                    <p style={{ margin: 0 }}><strong>Salesman:</strong> {salesmanName || 'N/A'}</p>
                    <p style={{ margin: '0.25rem 0' }}><strong>Created By:</strong> {creatorName || 'N/A'}</p>
                </div>
            </header>

            <section style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', fontSize: '11px' }}>
                <div>
                    <h3 style={{ margin: '0 0 0.25rem', fontWeight: 'bold' }}>To,</h3>
                    <p style={{ margin: 0, fontWeight: 'bold' }}>{recipientName}</p>
                    <p style={{ margin: '0.25rem 0' }}>{recipientAddress}</p>
                    <p style={{ margin: 0 }}><strong>Contact No:</strong> {recipientPhone || "-"}</p>
                    <p style={{ margin: '0.25rem 0' }}><strong>GSTIN:</strong> {recipientGstin || "-"}</p>
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
                                        
                                        {/* ✅ Updated Particulars Cell to show Category & Description */}
                                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                                            <div style={{ fontWeight: 'bold' }}>
                                                {'vasName' in item ? item.vasName : item.collectionBrand}
                                            </div>
                                            {item.categoryGroup && (
                                                <div style={{ fontSize: '10px', color: '#555', marginTop: '2px' }}>
                                                    ({item.categoryGroup})
                                                </div>
                                            )}
                                            {item.salesDescription && !('vasName' in item) && (
                                                <div style={{ fontSize: '10px', color: '#666', fontStyle: 'italic', marginTop: '2px' }}>
                                                    {item.salesDescription}
                                                </div>
                                            )}
                                        </td>
                                        
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>{Number(item.quantity).toFixed(2)}</td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'left' }}>{(item as any).unit || (item as any).stockUnit || "Mtr"}</td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>
                                            {formatToINR(Number((item as any).exclusiveRate ?? item.rate))}
                                        </td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR(item.amount)}</td>
                                        <td style={{ padding: '6px', border: '1px solid #ddd', textAlign: 'right' }}>{formatToINR((item as CalculatedItem).discountAmount || 0)}<br/>@{(Number((item as CalculatedItem).discountPercent) || 0).toFixed(2)}%</td>
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
