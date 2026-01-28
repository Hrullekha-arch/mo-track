"use client";

import * as React from "react";
import { format } from "date-fns";
import Image from "next/image";

// #region Helper Functions (Pure)

const formatToINR = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const numberToWords = (num: number): string => {
  const a = [
    "", "one ", "two ", "three ", "four ", "five ", "six ", "seven ", "eight ", "nine ", "ten ",
    "eleven ", "twelve ", "thirteen ", "fourteen ", "fifteen ", "sixteen ", "seventeen ", "eighteen ", "nineteen ",
  ];
  const b = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const n = ("000000000" + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return "";
  let str = "";
  str += n[1] !== "00" ? (a[Number(n[1])] || b[Number(n[1][0])] + " " + a[Number(n[1][1])]) + "crore " : "";
  str += n[2] !== "00" ? (a[Number(n[2])] || b[Number(n[2][0])] + " " + a[Number(n[2][1])]) + "lakh " : "";
  str += n[3] !== "00" ? (a[Number(n[3])] || b[Number(n[3][0])] + " " + a[Number(n[3][1])]) + "thousand " : "";
  str += n[4] !== "0" ? (a[Number(n[4])] || b[Number(n[4][0])] + " " + a[Number(n[4][1])]) + "hundred " : "";
  str += n[5] !== "00" ? (str !== "" ? "and " : "") + (a[Number(n[5])] || b[Number(n[5][0])] + " " + a[Number(n[5][1])]) : "";
  return str
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

const parseDateSafe = (dateInput: any): Date => {
  if (!dateInput) return new Date();
  if (dateInput instanceof Date) return dateInput;
  if (typeof dateInput?.toDate === "function") return dateInput.toDate();
  if (typeof dateInput === "string") {
    const d = new Date(dateInput);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
};


// #endregion

// #region Type Definitions (The Contract)
interface PrintableInvoicePayload {
  meta: {
    invoiceNo?: string;
    orderNo: string;
    quotationNo?: string;
    invoiceDate: string;
    isVas: boolean;
    salesPerson?: string;
    architect?: string;
  };
  customer: {
    name: string;
    phone: string;
    address: string;
    gstin?: string;
  };
  seller: {
    companyName: string;
    address: string;
    gstin: string;
  };
  items: Array<{
    name: string;
    bcn: string;
    hsn: string;
    quantity: number;
    uom: string;
    rate: number;
    discountPercent: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }>;
  totals: {
    subTotal: number;
    discount: number;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    roundOff: number;
    grandTotal: number;
    totalGst: number;
  };
  gstBreakdown: Array<{
    rate: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
  }>
}

interface PrintableInvoiceProps {
  payload: PrintableInvoicePayload | null;
}
// #endregion

export function PrintableInvoice({ payload }: PrintableInvoiceProps) {
  if (!payload) {
    return <div className="p-8 text-center text-muted-foreground">Invoice data not available.</div>;
  }
  
  const { meta, customer, seller, items, totals, gstBreakdown } = payload;
  const roundedTotal = totals.grandTotal;
  const getGstPercentFromItem = (item: {
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
}) => {
  const taxable = Number(item.taxableAmount || 0);
  if (!taxable) return 0;

  const totalTax = Number(item.igst || 0) + Number(item.cgst || 0) + Number(item.sgst || 0);
  return (totalTax / taxable) * 100; // e.g. 18
};

  return (
    <div
      style={{
        width: "210mm",
        minHeight: "297mm",
        margin: "auto",
        padding: "1rem",
        backgroundColor: "white",
        color: "black",
        fontFamily: "Arial, sans-serif",
        fontSize: "10px",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          borderBottom: "1px solid black",
          paddingBottom: "0.5rem",
        }}
      >
        <div style={{ flex: "0 0 120px" }}>
            <Image src="/logo.png" alt="MoTrack Logo" width={100} height={50} style={{ width: "100px", height: "auto" }} />
        </div>

        <div style={{ flex: "1", textAlign: "center" }}>
          <h1 style={{ fontSize: "14px", fontWeight: "bold", margin: 0, borderBottom: "1px solid black", paddingBottom: "4px" }}>
            TAX INVOICE
          </h1>
          <h2 style={{ fontSize: "16px", fontWeight: "bold", margin: "0.5rem 0 0.25rem" }}>
            {seller.companyName}
          </h2>
          <p style={{ margin: 0, fontSize: "10px" }}>
            {seller.address}
          </p>
        </div>

        <div style={{ flex: "0 0 120px" }} />
      </header>

      {/* Billing & Invoice Info Section */}
      <section style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid black", borderBottom: "1px solid black", padding: "0.5rem 0" }}>
        <div style={{ width: "60%" }}>
          <p style={{ margin: 0 }}>
            <strong>Billing Address</strong>
          </p>
          <p style={{ margin: "2px 0", fontWeight: "bold" }}>{customer.name}</p>
          <p style={{ margin: "2px 0" }}>{customer.address}</p>
          <p style={{ margin: "2px 0" }}>Phone No: {customer.phone}</p>
          <p style={{ margin: "2px 0" }}>GSTIN: {customer.gstin || "Unregistered"}</p>
        </div>

        <div style={{ width: "38%", border: "1px solid black" }}>
          <div style={{ display: "flex", borderBottom: "1px solid black" }}>
            <p style={{ width: "50%", margin: "2px 4px" }}>Date</p>
            <p style={{ width: "50%", margin: "2px 4px", borderLeft: "1px solid black", paddingLeft: "4px" }}>
              <strong>{format(parseDateSafe(meta.invoiceDate), "dd/MM/yyyy")}</strong>
            </p>
          </div>

          <div style={{ display: "flex", borderBottom: "1px solid black" }}>
            <p style={{ width: "50%", margin: "2px 4px" }}>Order No</p>
            <p style={{ width: "50%", margin: "2px 4px", borderLeft: "1px solid black", paddingLeft: "4px" }}>
              <strong>{String(meta.orderNo || "").replace("MOTRACK-", "")}</strong>
            </p>
          </div>

          <div style={{ display: "flex", borderBottom: "1px solid black" }}>
            <p style={{ width: "50%", margin: "2px 4px" }}>Invoice No</p>
            <p style={{ width: "50%", margin: "2px 4px", borderLeft: "1px solid black", paddingLeft: "4px" }}>
              <strong>{meta.invoiceNo || "N/A"}</strong>
            </p>
          </div>

          <div style={{ display: "flex", borderBottom: "1px solid black" }}>
            <p style={{ width: "50%", margin: "2px 4px" }}>Architect</p>
            <p style={{ width: "50%", margin: "2px 4px", borderLeft: "1px solid black", paddingLeft: "4px" }}>
              <strong>{meta.architect || "-"}</strong>
            </p>
          </div>

          <div style={{ display: "flex" }}>
            <p style={{ width: "50%", margin: "2px 4px" }}>Sales Representative</p>
            <p style={{ width: "50%", margin: "2px 4px", borderLeft: "1px solid black", paddingLeft: "4px" }}>
              <strong>{meta.salesPerson || "-"}</strong>
            </p>
          </div>
        </div>
      </section>

      {/* Items Table */}
      <main style={{ marginTop: "0.5rem", border: "1px solid black" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
          <thead>
            <tr style={{ backgroundColor: "#f2f2f2" }}>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "left", width: "3%" }}>Sr No</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "left", width: "25%" }}>Collection / Brand - Serial No</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "left", width: "8%" }}>HSN</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", width: "8%" }}>Qty</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "left", width: "8%" }}>UOM</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", width: "10%" }}>Rate</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", width: "10%" }}>Amt</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", width: "8%" }}>Disc. %</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", width: "10%" }}>Value</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", width: "6%" }}>CGST</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", width: "6%" }}>SGST</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", width: "6%" }}>IGST</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const gstPercent = getGstPercentFromItem(item);
               const displayRate =
                meta.isVas
                  ? item.rate
                  : gstPercent > 0
                    ? item.rate / (1 + gstPercent / 100)
                    : item.rate;

              const amount = item.rate * item.quantity; // keep your old amount logic if you want totals unchanged
              const gstRate = item.cgst > 0 ? (item.cgst / item.taxableAmount) * 100 * 2 : 0;
              return (
                <tr key={item.bcn || index}>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "center" }}>{index + 1}</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd" }}>
                    {item.name}
                    <br />
                    <strong>{item.bcn}</strong>
                  </td>
                  <td style={{ padding: "4px", border: "1px solid #ddd" }}>{item.hsn || ""}</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{item.quantity.toFixed(2)}</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "left" }}>{item.uom || 'Mtr'}</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}> {formatToINR(displayRate)}</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{formatToINR(amount)}</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{item.discountPercent.toFixed(2)}%</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{formatToINR(item.taxableAmount)}</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", fontSize: "9px", lineHeight: "1.2" }}>
                    {gstRate > 0 ? `${formatToINR(item.cgst)}\n@${(gstRate/2).toFixed(1)}%` : formatToINR(item.cgst)}
                  </td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", fontSize: "9px", lineHeight: "1.2" }}>
                    {gstRate > 0 ? `${formatToINR(item.sgst)}\n@${(gstRate/2).toFixed(1)}%` : formatToINR(item.sgst)}
                  </td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", fontSize: "9px", lineHeight: "1.2" }}>
                    {item.igst > 0 ? `${formatToINR(item.igst)}\n@${gstRate.toFixed(1)}%` : formatToINR(item.igst)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: "bold", backgroundColor: "#f9f9f9" }}>
              <td colSpan={3} style={{ padding: "4px", textAlign: "right", border: "1px solid #ddd" }}>
                Total
              </td>
              <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{formatToINR(items.reduce((sum, i) => sum + i.quantity, 0))}</td>
              <td colSpan={2} style={{ padding: "4px", border: "1px solid #ddd" }} />
              <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{formatToINR(totals.subTotal)}</td>
              <td colSpan={1} style={{ padding: "4px", border: "1px solid #ddd" }} />
              <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{formatToINR(totals.taxableValue)}</td>
              <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", fontSize: "9px" }}>{formatToINR(totals.cgst)}</td>
              <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", fontSize: "9px" }}>{formatToINR(totals.sgst)}</td>
              <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", fontSize: "9px" }}>{formatToINR(totals.igst)}</td>
            </tr>
          </tfoot>
        </table>
      </main>

      {/* GST Breakdown Section */}
      {gstBreakdown && gstBreakdown.length > 0 && (
        <section style={{ marginTop: "0.5rem", border: "1px solid black" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f2f2f2" }}>
                <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "center" }}>Taxable Value</th>
                <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "center" }}>CGST</th>
                <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "center" }}>SGST</th>
                <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "center" }}>IGST</th>
                <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "center" }}>Total Tax</th>
              </tr>
            </thead>
            <tbody>
              {gstBreakdown.map((breakdown, index) => {
                const totalTax = breakdown.cgst + breakdown.sgst + breakdown.igst;
                return (
                  <tr key={index}>
                    <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>
                      {formatToINR(breakdown.taxable)}
                    </td>
                    <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>
                      {breakdown.cgst > 0 ? `${formatToINR(breakdown.cgst)} @${(breakdown.rate/2).toFixed(1)}%` : '-'}
                    </td>
                    <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>
                      {breakdown.sgst > 0 ? `${formatToINR(breakdown.sgst)} @${(breakdown.rate/2).toFixed(1)}%` : '-'}
                    </td>
                    <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>
                      {breakdown.igst > 0 ? `${formatToINR(breakdown.igst)} @${breakdown.rate.toFixed(1)}%` : '-'}
                    </td>
                    <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", fontWeight: "bold" }}>
                      {formatToINR(totalTax)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: "bold", backgroundColor: "#f9f9f9" }}>
                <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>
                  {formatToINR(totals.taxableValue)}
                </td>
                <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>
                  {formatToINR(totals.cgst)}
                </td>
                <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>
                  {formatToINR(totals.sgst)}
                </td>
                <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>
                  {formatToINR(totals.igst)}
                </td>
                <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>
                  {formatToINR(totals.totalGst)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      <footer style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between", borderTop: "1px solid black", paddingTop: "0.5rem" }}>
        <div style={{ width: "60%" }}>
          <p style={{ margin: "2px 0" }}>
            <strong>Amount in Words:</strong> {numberToWords(roundedTotal)} Rupees only
          </p>
          <p style={{ margin: "8px 0 2px", fontSize: "9px" }}>
            <strong>Bank Name:</strong> HDFC BANK LTD
          </p>
          <p style={{ margin: "2px 0", fontSize: "9px" }}>
            <strong>Account No:</strong> 50200094305041
          </p>
          <p style={{ margin: "2px 0", fontSize: "9px" }}>
            <strong>IFSC Code:</strong> HDFC0003871
          </p>
          <p style={{ margin: "2px 0", fontSize: "9px" }}>
            <strong>Branch:</strong> SCO-39, SECTOR-56, HUDA DISTRICT CENTRE, GURGAON-122001
          </p>
          <p style={{ margin: "8px 0 2px" }}>
            <strong>ADVANCE:</strong> ₹ 0.00
          </p>
        </div>

        <div style={{ width: "38%", display: "flex", justifyContent: "space-between" }}>
          <div style={{ width: "50%" }}>
            <p style={{ margin: "2px 0", textAlign: "right" }}>Subtotal</p>
            <p style={{ margin: "2px 0", textAlign: "right" }}>Discount</p>
            <p style={{ margin: "2px 0", textAlign: "right" }}>Taxable Value</p>
            <p style={{ margin: "2px 0", textAlign: "right" }}>CGST</p>
            <p style={{ margin: "2px 0", textAlign: "right" }}>SGST</p>
            <p style={{ margin: "2px 0", textAlign: "right" }}>Round Off</p>
            <p style={{ margin: "2px 0", textAlign: "right", fontWeight: "bold" }}>Net Amount</p>
          </div>
          <div style={{ width: "45%", textAlign: "right" }}>
            <p style={{ margin: "2px 0", borderBottom: "1px solid black", paddingBottom: "1px" }}>{formatToINR(totals.subTotal)}</p>
            <p style={{ margin: "2px 0", borderBottom: "1px solid black", paddingBottom: "1px" }}>{formatToINR(totals.discount)}</p>
            <p style={{ margin: "2px 0", borderBottom: "1px solid black", paddingBottom: "1px" }}>{formatToINR(totals.taxableValue)}</p>
            <p style={{ margin: "2px 0", borderBottom: "1px solid black", paddingBottom: "1px" }}>{formatToINR(totals.cgst)}</p>
            <p style={{ margin: "2px 0", borderBottom: "1px solid black", paddingBottom: "1px" }}>{formatToINR(totals.sgst)}</p>
            <p style={{ margin: "2px 0", borderBottom: "1px solid black", paddingBottom: "1px" }}>{formatToINR(totals.roundOff)}</p>
            <p style={{ margin: "2px 0", fontWeight: "bold", fontSize: "12px" }}>₹ {formatToINR(totals.grandTotal)}</p>
          </div>
        </div>
      </footer>

      <div style={{ marginTop: "1rem", borderTop: "1px solid black", paddingTop: "0.5rem", display: "flex", justifyContent: "space-between" }}>
        <div style={{ width: "60%" }}>
          <p style={{ margin: "2px 0", fontWeight: "bold" }}>Declaration</p>
          <p style={{ margin: "2px 0", fontSize: "9px" }}>
            We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
          </p>
        </div>
        <div style={{ width: "35%", textAlign: "right" }}>
          <p style={{ margin: "2px 0", fontWeight: "bold" }}>
            For {seller.companyName}
          </p>
          <div style={{ marginTop: "3rem", borderTop: "1px solid black", paddingTop: "4px" }}>
            <p style={{ margin: 0, fontSize: "9px" }}>Authorised Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}
