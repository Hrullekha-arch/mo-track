"use client";

import * as React from "react";
import { Invoice, InvoiceBatch, Order, Stock, TaxDetail } from "@/lib/types";
import { format } from "date-fns";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs, limit } from "firebase/firestore";
import Image from "next/image";

interface PrintableInvoiceProps {
  batches: InvoiceBatch[];
  orders: Order[];
  preGeneratedInvoiceNo?: string | null;
}

interface QuotationData {
  orderId: string;
  gstPercent?: number;
  cgstPercent?: number;
  sgstPercent?: number;
  igstPercent?: number;
}

interface GSTData {
  cgstPercent: number;
  sgstPercent: number;
  igstPercent: number;
  totalGstPercent: number;
  source: 'quotation' | 'invoice' | 'order' | 'tax-detail' | 'default';
}

const formatToINR = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const normalizeBcn = (value?: string) => {
  const normalized = (value || "").split(" - ")[0].trim();
  console.log('🔧 [normalizeBcn] Input:', value, '→ Output:', normalized);
  return normalized;
};

const toNumber = (value: unknown, fallback: number) => {
  const num = typeof value === "number" ? value : Number(value);
  const result = Number.isFinite(num) ? num : fallback;
  console.log('🔢 [toNumber] Input:', value, '→ Output:', result);
  return result;
};

const orderKey = (o: any) => String(o?.orderNo || o?.orderId || o?.id || "");

const resolveItemPricing = (order: Order | undefined, item: InvoiceBatch["items"][number]) => {
  console.log('💰 [resolveItemPricing] Item:', item.itemName, 'BCN:', item.bcn);
  const normalizedBcn = normalizeBcn(item.bcn);

  const orderItems: Array<{
    collectionBrand?: string;
    rate?: number;
    discountPercent?: number;
    gstPercent?: number;
  }> = (order as any)?.items || [];

  const matched = orderItems.find((i) => normalizeBcn(i.collectionBrand) === normalizedBcn);
  console.log('💰 [resolveItemPricing] Matched order item:', matched);

  const rate = toNumber(matched?.rate ?? (item as any).rate, 0);
  const discountPercent = toNumber(matched?.discountPercent ?? (item as any).discountPercent, 0);
  const gstPercent = toNumber(matched?.gstPercent ?? (item as any).gstPercent, 0);

  console.log('💰 [resolveItemPricing] Resolved:', { rate, discountPercent, gstPercent });
  return { rate, discountPercent, gstPercent };
};

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

// **NEW: Fetch GST from Quotation**
const fetchGSTFromQuotation = async (orderId: string): Promise<GSTData> => {
  console.log('📄 [fetchGSTFromQuotation] ========================================');
  console.log('📄 [fetchGSTFromQuotation] Fetching GST for Order ID:', orderId);
  
  try {
    console.log('📄 [fetchGSTFromQuotation] Querying quotations collection...');
    const quotationsRef = collection(db, 'quotations');
    const q = query(quotationsRef, where('orderId', '==', orderId), limit(1));
    
    console.log('📄 [fetchGSTFromQuotation] Executing query...');
    const querySnapshot = await getDocs(q);
    
    console.log('📄 [fetchGSTFromQuotation] Documents found:', querySnapshot.docs.length);
    
    if (querySnapshot.empty) {
      console.warn('⚠️ [fetchGSTFromQuotation] No quotation found for orderId:', orderId);
      console.warn('⚠️ [fetchGSTFromQuotation] Using default GST: 2.5% CGST + 2.5% SGST (5% Total)');
      return {
        cgstPercent: 2.5,
        sgstPercent: 2.5,
        igstPercent: 0,
        totalGstPercent: 5,
        source: 'default'
      };
    }
    
    const quotationDoc = querySnapshot.docs[0];
    const quotationData = quotationDoc.data() as QuotationData;
    
    console.log('📄 [fetchGSTFromQuotation] Quotation Document ID:', quotationDoc.id);
    console.log('📄 [fetchGSTFromQuotation] Quotation Data:', quotationData);
    
    // Extract GST percentages with multiple fallback strategies
    let cgstPercent = quotationData.cgstPercent || 0;
    let sgstPercent = quotationData.sgstPercent || 0;
    let igstPercent = quotationData.igstPercent || 0;
    
    // If individual components not found, try to split gstPercent
    if (cgstPercent === 0 && sgstPercent === 0 && quotationData.gstPercent) {
      console.log('📄 [fetchGSTFromQuotation] Using gstPercent to calculate CGST/SGST:', quotationData.gstPercent);
      cgstPercent = quotationData.gstPercent / 2;
      sgstPercent = quotationData.gstPercent / 2;
    }
    
    const totalGstPercent = cgstPercent + sgstPercent + igstPercent;
    
    console.log('📄 [fetchGSTFromQuotation] Extracted GST:', {
      cgstPercent,
      sgstPercent,
      igstPercent,
      totalGstPercent,
      source: 'quotation'
    });
    
    // Validation
    if (totalGstPercent === 0) {
      console.warn('⚠️ [fetchGSTFromQuotation] No GST found in quotation, using default 5%');
      return {
        cgstPercent: 2.5,
        sgstPercent: 2.5,
        igstPercent: 0,
        totalGstPercent: 5,
        source: 'default'
      };
    }
    
    console.log('✅ [fetchGSTFromQuotation] GST fetched successfully from quotation');
    console.log('📄 [fetchGSTFromQuotation] ========================================');
    
    return {
      cgstPercent,
      sgstPercent,
      igstPercent,
      totalGstPercent,
      source: 'quotation'
    };
    
  } catch (error) {
    console.error('❌ [fetchGSTFromQuotation] ERROR:', error);
    console.error('❌ [fetchGSTFromQuotation] Using fallback default GST');
    
    return {
      cgstPercent: 2.5,
      sgstPercent: 2.5,
      igstPercent: 0,
      totalGstPercent: 5,
      source: 'default'
    };
  }
};

export function PrintableInvoice({ batches, orders, preGeneratedInvoiceNo = null }: PrintableInvoiceProps) {
  console.log('🖨️ [PrintableInvoice] ========================================');
  console.log('🖨️ [PrintableInvoice] Component Rendering');
  console.log('🖨️ [PrintableInvoice] Batches:', batches?.length);
  console.log('🖨️ [PrintableInvoice] Orders:', orders?.length);
  console.log('🖨️ [PrintableInvoice] Pre-generated Invoice No:', preGeneratedInvoiceNo);
  
  const [stockDetails, setStockDetails] = React.useState<Record<string, Stock>>({});
  const [taxDetails, setTaxDetails] = React.useState<Record<string, TaxDetail>>({});
  const [invoiceDetails, setInvoiceDetails] = React.useState<Invoice | null>(null);
  const [logoSrc, setLogoSrc] = React.useState<string | null>(null);
  const [gstData, setGstData] = React.useState<GSTData | null>(null);
  const [isLoadingGST, setIsLoadingGST] = React.useState(true);

  const primaryBatch = batches?.[0];
  console.log('🖨️ [PrintableInvoice] Primary Batch:', primaryBatch?.id);

  const ordersByKey = React.useMemo(() => {
    console.log('🗺️ [PrintableInvoice] Creating orders map...');
    const m = new Map<string, Order>();
    for (const o of orders || []) {
      const key = orderKey(o);
      console.log('  🗺️ [PrintableInvoice] Mapping order:', key);
      m.set(key, o);
    }
    console.log('🗺️ [PrintableInvoice] Orders map created with', m.size, 'entries');
    return m;
  }, [orders]);

  const primaryOrder = React.useMemo(() => {
    if (!primaryBatch) {
      console.log('⚠️ [PrintableInvoice] No primary batch');
      return undefined;
    }
    const order = ordersByKey.get(String(primaryBatch.orderId || ""));
    console.log('📋 [PrintableInvoice] Primary Order:', order?.id);
    return order;
  }, [primaryBatch, ordersByKey]);

  // Set logo
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const logo = `${window.location.origin}/logo.png`;
      console.log('🖼️ [PrintableInvoice] Setting logo source:', logo);
      setLogoSrc(logo);
    }
  }, []);

  // **NEW: Fetch GST from Quotation**
  React.useEffect(() => {
    const fetchGST = async () => {
      if (!primaryBatch?.orderId) {
        console.log('⚠️ [PrintableInvoice:fetchGST] No orderId available');
        setIsLoadingGST(false);
        return;
      }

      console.log('💹 [PrintableInvoice:fetchGST] ========================================');
      console.log('💹 [PrintableInvoice:fetchGST] Starting GST fetch for orderId:', primaryBatch.orderId);
      
      const isVasInvoice = primaryBatch.isVas === true;
      console.log('💹 [PrintableInvoice:fetchGST] Is VAS Invoice:', isVasInvoice);

      if (isVasInvoice) {
        console.log('💹 [PrintableInvoice:fetchGST] VAS Invoice - using hardcoded 18% GST');
        setGstData({
          cgstPercent: 9,
          sgstPercent: 9,
          igstPercent: 0,
          totalGstPercent: 18,
          source: 'default'
        });
        setIsLoadingGST(false);
        return;
      }

      try {
        // First check if invoice already has GST percentages stored
        const invoiceIdToCheck = (primaryBatch as any)?.invoiceId;
        console.log('💹 [PrintableInvoice:fetchGST] Checking invoice ID:', invoiceIdToCheck);
        
        if (invoiceIdToCheck) {
          console.log('💹 [PrintableInvoice:fetchGST] Fetching invoice document...');
          const invoiceRef = doc(db, "invoices", String(invoiceIdToCheck));
          const invoiceSnap = await getDoc(invoiceRef);
          
          if (invoiceSnap.exists()) {
            const invData = invoiceSnap.data() as Invoice;
            console.log('💹 [PrintableInvoice:fetchGST] Invoice data:', invData);
            
            if ((invData as any).gstPercentages) {
              console.log('✅ [PrintableInvoice:fetchGST] GST found in invoice document');
              const gstPercentages = (invData as any).gstPercentages;
              setGstData({
                cgstPercent: gstPercentages.cgst || 2.5,
                sgstPercent: gstPercentages.sgst || 2.5,
                igstPercent: gstPercentages.igst || 0,
                totalGstPercent: gstPercentages.total || 5,
                source: 'invoice'
              });
              setIsLoadingGST(false);
              console.log('💹 [PrintableInvoice:fetchGST] ========================================');
              return;
            }
          }
        }

        // If not found in invoice, fetch from quotation
        console.log('💹 [PrintableInvoice:fetchGST] Fetching GST from quotation...');
        const quotationGST = await fetchGSTFromQuotation(primaryBatch.orderId);
        console.log('💹 [PrintableInvoice:fetchGST] Quotation GST result:', quotationGST);
        
        setGstData(quotationGST);
        console.log('✅ [PrintableInvoice:fetchGST] GST data set successfully');
        
      } catch (error) {
        console.error('❌ [PrintableInvoice:fetchGST] Error fetching GST:', error);
        setGstData({
          cgstPercent: 2.5,
          sgstPercent: 2.5,
          igstPercent: 0,
          totalGstPercent: 5,
          source: 'default'
        });
      } finally {
        setIsLoadingGST(false);
        console.log('💹 [PrintableInvoice:fetchGST] ========================================');
      }
    };

    fetchGST();
  }, [primaryBatch]);

  // Fetch stock, tax details, and invoice details
  React.useEffect(() => {
    const fetchDetails = async () => {
      if (!primaryBatch) {
        console.log('⚠️ [PrintableInvoice:fetchDetails] No primary batch');
        return;
      }

      console.log('📦 [PrintableInvoice:fetchDetails] ========================================');
      console.log('📦 [PrintableInvoice:fetchDetails] Starting data fetch');

      const allItems = (batches || []).flatMap((b) => b.items || []);
      const uniqueBcns = [...new Set(allItems.map((it) => it.bcn).filter(Boolean))];
      console.log('📦 [PrintableInvoice:fetchDetails] Unique BCNs:', uniqueBcns.length);

      const newStockDetails: Record<string, Stock> = {};
      const newTaxDetails: Record<string, TaxDetail> = {};
      const hsnCodes = new Set<string>();

      // Fetch stock details (for HSN)
      console.log('📦 [PrintableInvoice:fetchDetails] Fetching stock details...');
      for (const bcn of uniqueBcns) {
        const stockId = String(bcn).replace(/\//g, "-");
        console.log(`  📦 [PrintableInvoice:fetchDetails] Fetching stock: ${stockId}`);
        const stockRef = doc(db, "stocks", stockId);
        const stockSnap = await getDoc(stockRef);
        if (stockSnap.exists()) {
          const stockData = stockSnap.data() as Stock;
          newStockDetails[bcn] = stockData;
          console.log(`  ✅ [PrintableInvoice:fetchDetails] Stock found, HSN: ${(stockData as any).hsnCode}`);
          if ((stockData as any).hsnCode) hsnCodes.add(String((stockData as any).hsnCode));
        } else {
          console.log(`  ⚠️ [PrintableInvoice:fetchDetails] Stock not found: ${stockId}`);
        }
      }
      setStockDetails(newStockDetails);
      console.log('📦 [PrintableInvoice:fetchDetails] Stock details fetched:', Object.keys(newStockDetails).length);

      // Fetch tax details by HSN (fallback)
      if (hsnCodes.size > 0) {
        console.log('📦 [PrintableInvoice:fetchDetails] Fetching tax details for HSN codes:', Array.from(hsnCodes));
        const list = Array.from(hsnCodes);
        const chunks: string[][] = [];
        for (let i = 0; i < list.length; i += 10) chunks.push(list.slice(i, i + 10));

        for (const chunk of chunks) {
          console.log('  📦 [PrintableInvoice:fetchDetails] Querying chunk:', chunk);
          const taxQuery = query(collection(db, "taxDetails"), where("hsnCode", "in", chunk));
          const taxSnaps = await getDocs(taxQuery);
          console.log('  📦 [PrintableInvoice:fetchDetails] Tax documents found:', taxSnaps.docs.length);
          
          taxSnaps.forEach((taxDoc) => {
            const data = taxDoc.data() as TaxDetail;
            const key = (data as any).hsnCode || taxDoc.id;
            newTaxDetails[String(key)] = data;
            console.log('  ✅ [PrintableInvoice:fetchDetails] Tax detail stored for HSN:', key);
          });
        }
        setTaxDetails(newTaxDetails);
        console.log('📦 [PrintableInvoice:fetchDetails] Tax details fetched:', Object.keys(newTaxDetails).length);
      }

      // Fetch invoice document
      const invoiceIdToFetch = (primaryBatch as any)?.invoiceId;
      console.log('📦 [PrintableInvoice:fetchDetails] Invoice ID to fetch:', invoiceIdToFetch);
      
      if (invoiceIdToFetch) {
        console.log('📦 [PrintableInvoice:fetchDetails] Fetching invoice document...');
        const invoiceRef = doc(db, "invoices", String(invoiceIdToFetch));
        const invoiceSnap = await getDoc(invoiceRef);
        if (invoiceSnap.exists()) {
          const invData = { ...(invoiceSnap.data() as Invoice), id: invoiceSnap.id };
          console.log('✅ [PrintableInvoice:fetchDetails] Invoice found:', invData.id);
          setInvoiceDetails(invData);
        } else {
          console.log('⚠️ [PrintableInvoice:fetchDetails] Invoice not found');
          setInvoiceDetails(null);
        }
      } else {
        console.log('⚠️ [PrintableInvoice:fetchDetails] No invoice ID to fetch');
        setInvoiceDetails(null);
      }
      
      console.log('📦 [PrintableInvoice:fetchDetails] ========================================');
    };

    if (batches?.length) {
      fetchDetails();
    }
  }, [batches, primaryBatch]);

  if (!primaryBatch || !primaryOrder) {
    console.log('⚠️ [PrintableInvoice] Missing primary batch or order - showing placeholder');
    return <div className="p-8">Select an order to generate an invoice.</div>;
  }

  if (isLoadingGST || !gstData) {
    console.log('⏳ [PrintableInvoice] Loading GST data...');
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>Loading invoice data...</p>
        </div>
      </div>
    );
  }

  const isVasInvoice = primaryBatch.isVas === true;
  console.log('🖨️ [PrintableInvoice] Is VAS Invoice:', isVasInvoice);
  console.log('🖨️ [PrintableInvoice] GST Data Source:', gstData.source);
  console.log('🖨️ [PrintableInvoice] GST Rates:', {
    cgst: gstData.cgstPercent,
    sgst: gstData.sgstPercent,
    igst: gstData.igstPercent,
    total: gstData.totalGstPercent
  });

  // Resolve items with correct pricing
  console.log('🔄 [PrintableInvoice] Resolving item pricing...');
  const resolvedItems = (batches || []).flatMap((b) =>
    (b.items || []).map((item) => {
      const order = ordersByKey.get(String(b.orderId || ""));
      const pricing = resolveItemPricing(order, item);
      return { ...item, rate: pricing.rate, discountPercent: pricing.discountPercent, gstPercent: pricing.gstPercent };
    })
  );
  console.log('🔄 [PrintableInvoice] Resolved items:', resolvedItems.length);

  // Consolidate by BCN
  console.log('📊 [PrintableInvoice] Consolidating items by BCN...');
  const consolidatedItems = resolvedItems.reduce((acc, item) => {
    const key = String(item.bcn || "");
    if (!key) return acc;
    if (!acc[key]) {
      acc[key] = { ...item, quantityAllocated: 0 };
      console.log(`  📊 [PrintableInvoice] New consolidated item: ${key}`);
    }
    acc[key].quantityAllocated += Number(item.quantityAllocated || 0);
    console.log(`  📊 [PrintableInvoice] Updated quantity for ${key}: ${acc[key].quantityAllocated}`);
    return acc;
  }, {} as Record<string, any>);

  const consolidatedItemList = Object.values(consolidatedItems);
  console.log('📊 [PrintableInvoice] Consolidated items count:', consolidatedItemList.length);

  // **UPDATED: Calculate totals using GST from quotation**
  console.log('💵 [PrintableInvoice] Calculating totals with quotation GST...');
  const totals = consolidatedItemList.reduce(
    (acc, item, index) => {
      console.log(`  💵 [PrintableInvoice] Item ${index + 1}/${consolidatedItemList.length}:`, item.itemName);
      
      const qty = toNumber(item.quantityAllocated, 0);
      const rate = toNumber(item.rate, 0);
      const amount = qty * rate;

      const discountPercent = toNumber(item.discountPercent, 0);
      const discountAmount = amount * (discountPercent / 100);
      const taxableValue = amount - discountAmount;

      // **USE GST FROM QUOTATION (fetched earlier)**
      const cgstRate = gstData.cgstPercent / 100;
      const sgstRate = gstData.sgstPercent / 100;
      const igstRate = gstData.igstPercent / 100;

      const cgst = taxableValue * cgstRate;
      const sgst = taxableValue * sgstRate;
      const igst = taxableValue * igstRate;

      console.log(`  💵 [PrintableInvoice] Calculations:`, {
        qty,
        rate,
        amount,
        discountPercent,
        taxableValue,
        cgst: `${cgst.toFixed(2)} (${gstData.cgstPercent}%)`,
        sgst: `${sgst.toFixed(2)} (${gstData.sgstPercent}%)`,
        igst: `${igst.toFixed(2)} (${gstData.igstPercent}%)`
      });

      acc.totalQty += qty;
      acc.totalAmount += amount;
      acc.totalDiscount += discountAmount;
      acc.totalValue += taxableValue;
      acc.totalCgst += cgst;
      acc.totalSgst += sgst;
      acc.totalIgst += igst;

      return acc;
    },
    { totalQty: 0, totalAmount: 0, totalDiscount: 0, totalValue: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0 }
  );

  console.log('💵 [PrintableInvoice] Final Totals:', totals);

  const netAmount = totals.totalValue + totals.totalCgst + totals.totalSgst + totals.totalIgst;
  const roundedAmount = Math.round(netAmount);
  const roundOff = roundedAmount - netAmount;

  console.log('💵 [PrintableInvoice] Final Amounts:', {
    netAmount,
    roundedAmount,
    roundOff,
    gstBreakdown: {
      cgst: totals.totalCgst,
      sgst: totals.totalSgst,
      igst: totals.totalIgst,
      total: totals.totalCgst + totals.totalSgst + totals.totalIgst
    }
  });

  const overallDiscountPercent = totals.totalAmount > 0 ? (totals.totalDiscount / totals.totalAmount) * 100 : 0;
  console.log('💵 [PrintableInvoice] Overall Discount Percent:', overallDiscountPercent);
  console.log('🖨️ [PrintableInvoice] ========================================');

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
          {logoSrc && (
            <Image src={logoSrc} alt="MoTrack Logo" width={100} height={50} style={{ width: "100px", height: "auto" }} />
          )}
        </div>

                <div style={{ flex: "1", textAlign: "center" }}>
          <h1 style={{ fontSize: "14px", fontWeight: "bold", margin: 0, borderBottom: "1px solid black", paddingBottom: "4px" }}>
            TAX INVOICE
          </h1>
          <h2 style={{ fontSize: "16px", fontWeight: "bold", margin: "0.5rem 0 0.25rem" }}>
            {isVasInvoice ? "MO SPACES PVT.LTD" : "MO DESIGNS PRIVATE LIMITED"}
          </h2>
          <p style={{ margin: 0, fontSize: "10px" }}>
            A6 SUSHANT LOK 1, M G ROAD, GURGAON
            <br />
            GURGAON-122002 (HARYANA) INDIA
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
          <p style={{ margin: "2px 0", fontWeight: "bold" }}>{(primaryOrder as any).customerName}</p>
          <p style={{ margin: "2px 0" }}>{(primaryOrder as any).customerAddress}</p>
          <p style={{ margin: "2px 0" }}>Phone No: {(primaryOrder as any).customerPhone}</p>
          <p style={{ margin: "2px 0" }}>GSTIN: {(primaryOrder as any)?.gstin || "-"}</p>
        </div>

        <div style={{ width: "38%", border: "1px solid black" }}>
          <div style={{ display: "flex", borderBottom: "1px solid black" }}>
            <p style={{ width: "50%", margin: "2px 4px" }}>Date</p>
            <p style={{ width: "50%", margin: "2px 4px", borderLeft: "1px solid black", paddingLeft: "4px" }}>
              <strong>{format(parseDateSafe(primaryBatch.createdAt), "dd/MM/yyyy")}</strong>
            </p>
          </div>

          <div style={{ display: "flex", borderBottom: "1px solid black" }}>
            <p style={{ width: "50%", margin: "2px 4px" }}>Order No</p>
            <p style={{ width: "50%", margin: "2px 4px", borderLeft: "1px solid black", paddingLeft: "4px" }}>
              <strong>{String(primaryBatch.orderId || "").replace("MOTRACK-", "")}</strong>
            </p>
          </div>

          <div style={{ display: "flex", borderBottom: "1px solid black" }}>
            <p style={{ width: "50%", margin: "2px 4px" }}>Invoice No</p>
            <p style={{ width: "50%", margin: "2px 4px", borderLeft: "1px solid black", paddingLeft: "4px" }}>
              <strong>{preGeneratedInvoiceNo || (invoiceDetails as any)?.invoiceNo || "N/A"}</strong>
            </p>
          </div>

          <div style={{ display: "flex", borderBottom: "1px solid black" }}>
            <p style={{ width: "50%", margin: "2px 4px" }}>Architect</p>
            <p style={{ width: "50%", margin: "2px 4px", borderLeft: "1px solid black", paddingLeft: "4px" }}>
              <strong>{(primaryOrder as any)?.architect || "-"}</strong>
            </p>
          </div>

          <div style={{ display: "flex" }}>
            <p style={{ width: "50%", margin: "2px 4px" }}>Sales Representative</p>
            <p style={{ width: "50%", margin: "2px 4px", borderLeft: "1px solid black", paddingLeft: "4px" }}>
              <strong>{(primaryOrder as any).salesPerson || "-"}</strong>
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
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", width: "8%" }}>Rate</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", width: "10%" }}>Amt</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", width: "8%" }}>Disc. %</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", width: "10%" }}>Value</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", width: "6%" }}>CGST</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", width: "6%" }}>SGST</th>
              <th style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right", width: "6%" }}>IGST</th>
            </tr>
          </thead>

                    <tbody>
            {consolidatedItemList.map((item: any, index: number) => {
              console.log(`🖨️ [PrintableInvoice:Table] Rendering row ${index + 1}:`, item.itemName);
              
              const qty = toNumber(item.quantityAllocated, 0);
              const rate = toNumber(item.rate, 0);
              const amount = qty * rate;

              const discountPercent = toNumber(item.discountPercent, 0);
              const discountAmount = amount * (discountPercent / 100);
              const taxableValue = amount - discountAmount;

              // **USE GST FROM QUOTATION**
              const cgstRate = gstData.cgstPercent / 100;
              const sgstRate = gstData.sgstPercent / 100;
              const igstRate = gstData.igstPercent / 100;

              const cgst = taxableValue * cgstRate;
              const sgst = taxableValue * sgstRate;
              const igst = taxableValue * igstRate;

              const stock = stockDetails[item.bcn];

              console.log(`  🖨️ [PrintableInvoice:Table] Row ${index + 1} calculations:`, {
                qty,
                rate,
                amount,
                discountPercent,
                taxableValue,
                cgst: `${cgst.toFixed(2)} (${gstData.cgstPercent}%)`,
                sgst: `${sgst.toFixed(2)} (${gstData.sgstPercent}%)`,
                igst: `${igst.toFixed(2)} (${gstData.igstPercent}%)`
              });

              return (
                <tr key={item.bcn || index}>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "center" }}>{index + 1}</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd" }}>
                    {item.itemName}
                    <br />
                    <strong>{item.bcn}</strong>
                  </td>
                  <td style={{ padding: "4px", border: "1px solid #ddd" }}>{(stock as any)?.hsnCode || ""}</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{qty.toFixed(2)}</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{formatToINR(rate)}</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{formatToINR(amount)}</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{discountPercent.toFixed(2)}%</td>
                  <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{formatToINR(taxableValue)}</td>
                  
                  {/* ✅ CGST with Rate */}
                  <td style={{ 
                    padding: "4px", 
                    border: "1px solid #ddd", 
                    textAlign: "right",
                    fontSize: "9px",
                    lineHeight: "1.2"
                  }}>
                    {formatToINR(cgst)}
                    <br />
                    <span style={{ fontSize: "8px", color: "#666" }}>@{gstData.cgstPercent}%</span>
                  </td>
                  
                  {/* ✅ SGST with Rate */}
                  <td style={{ 
                    padding: "4px", 
                    border: "1px solid #ddd", 
                    textAlign: "right",
                    fontSize: "9px",
                    lineHeight: "1.2"
                  }}>
                    {formatToINR(sgst)}
                    <br />
                    <span style={{ fontSize: "8px", color: "#666" }}>@{gstData.sgstPercent}%</span>
                  </td>
                  
                  {/* ✅ IGST with Rate */}
                  <td style={{ 
                    padding: "4px", 
                    border: "1px solid #ddd", 
                    textAlign: "right",
                    fontSize: "9px",
                    lineHeight: "1.2"
                  }}>
                    {formatToINR(igst)}
                    {gstData.igstPercent > 0 && (
                      <>
                        <br />
                        <span style={{ fontSize: "8px", color: "#666" }}>@{gstData.igstPercent}%</span>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* ✅ UPDATED FOOTER WITH RATES */}
          <tfoot>
            <tr style={{ fontWeight: "bold", backgroundColor: "#f9f9f9" }}>
              <td colSpan={3} style={{ padding: "4px", textAlign: "right", border: "1px solid #ddd" }}>
                Total
              </td>
              <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{formatToINR(totals.totalQty)}</td>
              <td style={{ padding: "4px", border: "1px solid #ddd" }} />
              <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{formatToINR(totals.totalAmount)}</td>
              <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{overallDiscountPercent.toFixed(2)}%</td>
              <td style={{ padding: "4px", border: "1px solid #ddd", textAlign: "right" }}>{formatToINR(totals.totalValue)}</td>
              
              {/* ✅ CGST Total with Rate */}
              <td style={{ 
                padding: "4px", 
                border: "1px solid #ddd", 
                textAlign: "right",
                fontSize: "9px",
                lineHeight: "1.2"
              }}>
                {formatToINR(totals.totalCgst)}
                <br />
                <span style={{ fontSize: "8px", color: "#666" }}>@{gstData.cgstPercent}%</span>
              </td>
              
              {/* ✅ SGST Total with Rate */}
              <td style={{ 
                padding: "4px", 
                border: "1px solid #ddd", 
                textAlign: "right",
                fontSize: "9px",
                lineHeight: "1.2"
              }}>
                {formatToINR(totals.totalSgst)}
                <br />
                <span style={{ fontSize: "8px", color: "#666" }}>@{gstData.sgstPercent}%</span>
              </td>
              
              {/* ✅ IGST Total with Rate */}
              <td style={{ 
                padding: "4px", 
                border: "1px solid #ddd", 
                textAlign: "right",
                fontSize: "9px",
                lineHeight: "1.2"
              }}>
                {formatToINR(totals.totalIgst)}
                {gstData.igstPercent > 0 && (
                  <>
                    <br />
                    <span style={{ fontSize: "8px", color: "#666" }}>@{gstData.igstPercent}%</span>
                  </>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </main>

      {/* Footer with Totals and Bank Details */}
      <footer style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between", borderTop: "1px solid black", paddingTop: "0.5rem" }}>
        <div style={{ width: "60%" }}>
          <p style={{ margin: "2px 0" }}>
            <strong>Amount in Words:</strong> {numberToWords(roundedAmount)} Rupees only
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
          
          {/* GST Info Badge */}
          <div style={{ marginTop: "8px", padding: "4px 8px", backgroundColor: "#f0f0f0", border: "1px solid #ccc", display: "inline-block", fontSize: "9px" }}>
            <strong>GST Source:</strong> {gstData.source === 'quotation' ? 'Quotation' : gstData.source === 'invoice' ? 'Invoice' : 'Default'} | 
            <strong> Rates:</strong> CGST {gstData.cgstPercent}% + SGST {gstData.sgstPercent}% 
            {gstData.igstPercent > 0 && ` + IGST ${gstData.igstPercent}%`}
          </div>
        </div>

        <div style={{ width: "38%", display: "flex", justifyContent: "space-between" }}>
          <div style={{ width: "50%" }}>
            <p style={{ margin: "2px 0", textAlign: "right" }}>Subtotal</p>
            <p style={{ margin: "2px 0", textAlign: "right" }}>Discount</p>
            <p style={{ margin: "2px 0", textAlign: "right" }}>Taxable Value</p>
            <p style={{ margin: "2px 0", textAlign: "right" }}>CGST ({gstData.cgstPercent}%)</p>
            <p style={{ margin: "2px 0", textAlign: "right" }}>SGST ({gstData.sgstPercent}%)</p>
            {gstData.igstPercent > 0 && (
              <p style={{ margin: "2px 0", textAlign: "right" }}>IGST ({gstData.igstPercent}%)</p>
            )}
            <p style={{ margin: "2px 0", textAlign: "right" }}>Round Off</p>
            <p style={{ margin: "2px 0", textAlign: "right", fontWeight: "bold" }}>Net Amount</p>
          </div>

          <div style={{ width: "45%", textAlign: "right" }}>
            <p style={{ margin: "2px 0", borderBottom: "1px solid black", paddingBottom: "1px" }}>{formatToINR(totals.totalAmount)}</p>
            <p style={{ margin: "2px 0", borderBottom: "1px solid black", paddingBottom: "1px" }}>{formatToINR(totals.totalDiscount)}</p>
            <p style={{ margin: "2px 0", borderBottom: "1px solid black", paddingBottom: "1px" }}>{formatToINR(totals.totalValue)}</p>
            <p style={{ margin: "2px 0", borderBottom: "1px solid black", paddingBottom: "1px" }}>{formatToINR(totals.totalCgst)}</p>
            <p style={{ margin: "2px 0", borderBottom: "1px solid black", paddingBottom: "1px" }}>{formatToINR(totals.totalSgst)}</p>
            {gstData.igstPercent > 0 && (
              <p style={{ margin: "2px 0", borderBottom: "1px solid black", paddingBottom: "1px" }}>{formatToINR(totals.totalIgst)}</p>
            )}
            <p style={{ margin: "2px 0", borderBottom: "1px solid black", paddingBottom: "1px" }}>{formatToINR(roundOff)}</p>
            <p style={{ margin: "2px 0", fontWeight: "bold", fontSize: "12px" }}>₹ {formatToINR(roundedAmount)}</p>
          </div>
        </div>
      </footer>

      {/* Declaration & Signature */}
      <div style={{ marginTop: "1rem", borderTop: "1px solid black", paddingTop: "0.5rem", display: "flex", justifyContent: "space-between" }}>
        <div style={{ width: "60%" }}>
          <p style={{ margin: "2px 0", fontWeight: "bold" }}>Declaration</p>
          <p style={{ margin: "2px 0", fontSize: "9px" }}>
            We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
          </p>
          <p style={{ margin: "8px 0 2px", fontSize: "9px" }}>
            <strong>Registered Office:</strong> A-6, Sushant Lok-I, M G Road, Gurgaon-122002
          </p>
          <p style={{ margin: "2px 0", fontSize: "9px" }}>
            <strong>Branch:</strong> 850, Sushant Lok-II, Sector-56, Gurgaon, HARYANA
          </p>
          <p style={{ margin: "2px 0", fontSize: "9px" }}>
            <strong>Phone:</strong> 0124-4777888
          </p>
        </div>
        
        <div style={{ width: "35%", textAlign: "right" }}>
          <p style={{ margin: "2px 0", fontWeight: "bold" }}>
            For {isVasInvoice ? "MO SPACES PVT.LTD" : "MO DESIGNS PRIVATE LIMITED"}
          </p>
          <div style={{ marginTop: "3rem", borderTop: "1px solid black", paddingTop: "4px" }}>
            <p style={{ margin: 0, fontSize: "9px" }}>Authorised Signatory</p>
          </div>
        </div>
      </div>

      {/* Terms & Conditions */}
      <div style={{ marginTop: "1rem", borderTop: "1px dashed #ccc", paddingTop: "0.5rem" }}>
        <p style={{ margin: "2px 0", fontWeight: "bold", fontSize: "9px" }}>Terms & Conditions:</p>
        <ul style={{ margin: "4px 0", paddingLeft: "20px", fontSize: "8px" }}>
          <li>Goods once sold will not be taken back or exchanged.</li>
          <li>All disputes are subject to Gurgaon jurisdiction only.</li>
          <li>Payment terms as per agreement.</li>
        </ul>
      </div>

      {/* Watermark for preview */}
      {!preGeneratedInvoiceNo && !invoiceDetails && (
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%) rotate(-45deg)",
          fontSize: "72px",
          color: "rgba(0, 0, 0, 0.1)",
          fontWeight: "bold",
          pointerEvents: "none",
          zIndex: 1000
        }}>
          PREVIEW
        </div>
      )}
    </div>
  );
}
