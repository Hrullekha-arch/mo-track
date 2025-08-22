
'use server';

import { Invoice, Stock, TaxDetail, User, InvoiceBatch } from '@/lib/types';
import { adminDb } from '@/lib/firebase-admin';
import xml2js from 'xml2js';
import { doc, updateDoc, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { format } from 'date-fns';

// ---------------- Helpers ----------------

function escapeXml(unsafe: string): string {
  if (typeof unsafe !== 'string') return '';
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function getEnvTallyUrl(): string {
  const url = process.env.TALLY_SERVER_URL;
  if (!url) throw new Error('TALLY_SERVER_URL is not set');
  return url;
}

async function httpPostXml(xml: string): Promise<string> {
  const res = await fetch(getEnvTallyUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body: xml,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText} -> ${text.slice(0, 300)}`);
  }
  return text;
}

function tallyCreateOk(xml: string): boolean {
  return /<CREATED>1<\/CREATED>/.test(xml) || /<ALTERED>1<\/ALTERED>/.test(xml);
}

function extractVoucherNumber(xml: string): string | undefined {
  console.log("Tally voucher fetch response XML:", xml);
  const matches = [...xml.matchAll(/<VOUCHERNUMBER>([^<]+)<\/VOUCHERNUMBER>/g)];
  return matches.length ? matches[matches.length - 1][1] : undefined;
}

// ---------------- XML Builders ----------------

export async function buildLedgerCreateXML(customerName: string, customerPhone: string, state: string = 'Haryana'): Promise<string> {
  const ledgerName = escapeXml(`${customerName}-${customerPhone}`);
  const escapedState = escapeXml(state);
  const escapedPhone = escapeXml(customerPhone);
  
  return `
<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES>
     <SVCURRENTCOMPANY>MO Designs Private Limited - (2024-2025)</SVCURRENTCOMPANY>
    </STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="${ledgerName}" ACTION="Create">
      <NAME>${ledgerName}</NAME>
      <PARENT>Sundry Debtors</PARENT>
      <ISBILLWISEON>No</ISBILLWISEON>
      <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
      <AFFECTSSTOCK>No</AFFECTSSTOCK>
      <USEFORVAT>No</USEFORVAT>
      <TAXCLASSIFICATIONNAME/>
      <COUNTRYNAME>India</COUNTRYNAME>
      <LEDSTATENAME>${escapedState}</LEDSTATENAME>
      <PINCODE/>
      <EMAIL/>
      <PHONENUMBER>${escapedPhone}</PHONENUMBER>
      <INCOMETAXNUMBER/>
      <SALESTAXNUMBER/>
      <GSTREGISTRATIONTYPE>Unregistered/Consumer</GSTREGISTRATIONTYPE>
      <ISBILLWISEON>No</ISBILLWISEON>
      <ISBILLWISEPROVISIONAL>No</ISBILLWISEPROVISIONAL>
      <OPENINGBALANCE>0</OPENINGBALANCE>
     </LEDGER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`.trim();
}

export async function buildStockItemCreateXML(itemName: string): Promise<string> {
  const escapedItemName = escapeXml(itemName);
  return `
<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>All Masters</ID></HEADER>
  <BODY>
    <DESC><STATICVARIABLES><SVCURRENTCOMPANY>MO Designs Private Limited - (2024-2025)</SVCURRENTCOMPANY></STATICVARIABLES></DESC>
    <DATA>
      <TALLYMESSAGE>
        <STOCKITEM NAME="${escapedItemName}" ACTION="Create">
          <NAME>${escapedItemName}</NAME>
          <PARENT>Products</PARENT>
          <BASEUNITS>mtr</BASEUNITS>
        </STOCKITEM>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`.trim();
}

export async function buildSalesVoucherXML(invoice: Invoice): Promise<string> {
    const money = (n: number) => (Math.round(n * 100) / 100);
    const fmt = (n: number) => money(n).toFixed(2);

    const date = format(new Date(), 'yyyyMMdd');
    const partyLedgerName = escapeXml(`${invoice.customer.name}-${invoice.customer.phone}`);
    
    let salesmanRefText = invoice.salesPerson;
    const orderDoc = await adminDb.collection('orders').doc(invoice.orderId).get();
    if (orderDoc.exists && orderDoc.data()?.representativeId) {
        const salesmanDoc = await adminDb.collection('users').doc(orderDoc.data()?.representativeId).get();
        if (salesmanDoc.exists) {
            const salesmanData = salesmanDoc.data() as User;
            salesmanRefText = `${salesmanData.name} (${salesmanData.salesmanCode || 'N/A'})`;
        }
    }
    
    const totalQty = invoice.items.reduce((sum, item) => sum + item.quantityAllocated, 0);
    const firstItemName = invoice.items[0]?.bcn || 'items';
    const narration = escapeXml(`Sale of ${totalQty} mtr of Stock Item ${firstItemName}`);
    const stateName = "Haryana"; 

    const uniqueBcns = [...new Set(invoice.items.map(item => item.bcn))];
    const stockDetailsMap = new Map<string, Stock>();
    const taxDetailsMap = new Map<string, TaxDetail>();

    for (const bcn of uniqueBcns) {
        const stockId = bcn.replace(/\//g, '-');
        const stockDoc = await adminDb.collection('stocks').doc(stockId).get();
        if (stockDoc.exists) {
            const stockData = stockDoc.data() as Stock;
            stockDetailsMap.set(bcn, stockData);
            if (stockData.hsnCode) {
                const taxDoc = await adminDb.collection('taxDetails').doc(stockData.hsnCode).get();
                if (taxDoc.exists) {
                    taxDetailsMap.set(stockData.hsnCode, taxDoc.data() as TaxDetail);
                }
            }
        }
    }

    let inventoryEntries = '';
    let totalTaxableValue = 0;

    for (const item of invoice.items) {
        const stockDetail = stockDetailsMap.get(item.bcn);
        const taxDetail = stockDetail?.hsnCode ? taxDetailsMap.get(stockDetail.hsnCode) : undefined;
        const gstRate = taxDetail?.gst ?? 5; 
        const halfGst = gstRate / 2;
        const unit = stockDetail?.unit || 'mtr';

        const ledgerName = `Haryana Sale @ ${gstRate}%`;

        const qty = money(Number(item.quantityAllocated || 0));
        const rate = money(Number(item.rate || 0));
        const lineAmount = money(rate * qty);
        
        const discountPercent = money(item.discountPercent || 0);
        const discountAmount = money(lineAmount * (discountPercent / 100));
        const itemTaxableValue = money(lineAmount - discountAmount);
        totalTaxableValue += itemTaxableValue;

        inventoryEntries += `
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${escapeXml(item.bcn)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <RATE>${fmt(rate)}/${unit}</RATE>
              <DISCOUNT>${fmt(discountPercent)}</DISCOUNT>
              <AMOUNT>${fmt(itemTaxableValue)}</AMOUNT>
              <ACTUALQTY>${qty} ${unit}</ACTUALQTY>
              <BILLEDQTY>${qty} ${unit}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <GODOWNNAME>Mo</GODOWNNAME>
                <BATCHNAME>Primary Batch</BATCHNAME>
                <AMOUNT>${fmt(itemTaxableValue)}</AMOUNT>
                <ACTUALQTY>${qty} ${unit}</ACTUALQTY>
                <BILLEDQTY>${qty} ${unit}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>${escapeXml(ledgerName)}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <AMOUNT>${fmt(itemTaxableValue)}</AMOUNT>
              </ACCOUNTINGALLOCATIONS.LIST>
              <RATEDETAILS.LIST>
                <GSTRATEDUTYHEAD>CGST</GSTRATEDUTYHEAD>
                <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
                <GSTRATE>${halfGst}</GSTRATE>
              </RATEDETAILS.LIST>
              <RATEDETAILS.LIST>
                <GSTRATEDUTYHEAD>SGST/UTGST</GSTRATEDUTYHEAD>
                <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
                <GSTRATE>${halfGst}</GSTRATE>
              </RATEDETAILS.LIST>
            </ALLINVENTORYENTRIES.LIST>`;
    }
    const cgst = money(totalTaxableValue * 0.025);
    const sgst = money(totalTaxableValue * 0.025);
    const totalAmountBeforeRoundOff = money(totalTaxableValue + cgst + sgst);
    const roundedTotal = Math.round(totalAmountBeforeRoundOff);
    const roundOff = money(roundedTotal - totalAmountBeforeRoundOff);
    
    const partyLedgerEntry = `<LEDGERENTRIES.LIST>
            <LEDGERNAME>${partyLedgerName}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
            <AMOUNT>-${fmt(roundedTotal)}</AMOUNT>
        </LEDGERENTRIES.LIST>`;
    
    const cgstLedgerEntry = `<LEDGERENTRIES.LIST>
            <LEDGERNAME>Output CGST</LEDGERNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <AMOUNT>${fmt(cgst)}</AMOUNT>
            <VATEXPAMOUNT>${fmt(cgst)}</VATEXPAMOUNT>
        </LEDGERENTRIES.LIST>`;

    const sgstLedgerEntry = `<LEDGERENTRIES.LIST>
            <LEDGERNAME>Output SGST</LEDGERNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <AMOUNT>${fmt(sgst)}</AMOUNT>
            <VATEXPAMOUNT>${fmt(sgst)}</VATEXPAMOUNT>
        </LEDGERENTRIES.LIST>`;
        
    const roundOffLedgerEntry = roundOff !== 0 ? `<LEDGERENTRIES.LIST>
          <LEDGERNAME>Round Off</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${roundOff > 0 ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>
          <AMOUNT>${fmt(Math.abs(roundOff))}</AMOUNT>
        </LEDGERENTRIES.LIST>` : '';

    return `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>MO Designs Private Limited - (2024-2025)</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${date}</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${invoice.invoiceNo}</VOUCHERNUMBER>
            <REFERENCE>${escapeXml(salesmanRefText)}</REFERENCE>
            <ISINVOICE>Yes</ISINVOICE>
            <PARTYLEDGERNAME>${partyLedgerName}</PARTYLEDGERNAME>
            <PARTYNAME>${partyLedgerName}</PARTYNAME>
            <STATENAME>${stateName}</STATENAME>
            <PLACEOFSUPPLY>${stateName}</PLACEOFSUPPLY>
            <NARRATION>${narration}</NARRATION>
            ${partyLedgerEntry}
            ${inventoryEntries}
            ${cgstLedgerEntry}
            ${sgstLedgerEntry}
            ${roundOffLedgerEntry}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`.trim();
}

export async function buildVoucherFilterXML(ledgerName: string, amount: number): Promise<string> {
  const amountStr = (Math.round(amount * 100) / 100).toFixed(2);
  const date = format(new Date(), 'yyyyMMdd');
  return `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>VoucherFilter</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="VoucherFilter" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <NATIVEMETHOD>VoucherNumber</NATIVEMETHOD>
            <NATIVEMETHOD>VoucherTypeName</NATIVEMETHOD>
            <NATIVEMETHOD>LedgerName</NATIVEMETHOD>
            <NATIVEMETHOD>Date</NATIVEMETHOD>
            <FILTER>FilterByVoucherType</FILTER>
            <FILTER>FilterByLedgerName</FILTER>
            <FILTER>FilterByAmount</FILTER>
            <FILTER>FilterByDate</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="FilterByVoucherType">
            $VoucherTypeName = $$String:"Sales"
          </SYSTEM>
          <SYSTEM TYPE="Formulae" NAME="FilterByLedgerName">
            $LedgerName = $$String:"${ledgerName}"
          </SYSTEM>
          <SYSTEM TYPE="Formulae" NAME="FilterByAmount">
            $Amount = ${amountStr}
          </SYSTEM>
          <SYSTEM TYPE="Formulae" NAME="FilterByDate">
            $Date = $$Date:${date}
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`.trim();
}


// ---------------- Main ops ----------------

async function createIfNeeded(xml: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await httpPostXml(xml);
    const ok = tallyCreateOk(res);
    return { success: ok, message: res };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

async function fetchAndSaveVoucherNumber(invoice: Invoice): Promise<string | undefined> {
  const ledgerName = `${invoice.customer.name}-${invoice.customer.phone}`;
  const amount = Number(invoice?.totals?.grandTotal ?? 0);

  const filterXml = await buildVoucherFilterXML(escapeXml(ledgerName), amount);

  try {
    console.log("Sending Tally voucher fetch XML:", filterXml);

    const xml = await httpPostXml(filterXml);

    console.log("Tally voucher fetch response XML:", xml);

    const voucherNo = extractVoucherNumber(xml);
    if (voucherNo) {
      const batch = adminDb.batch(); // FIX: use adminDb.batch()
      const invoiceRef = adminDb.collection("invoices").doc(invoice.id);
      batch.update(invoiceRef, { tallyVoucherNo: voucherNo });

      const batchesSnap = await adminDb
        .collection("invoiceBatches")
        .where("invoiceId", "==", invoice.id)
        .get();

      batchesSnap.forEach(docSnap => {
        batch.update(docSnap.ref, { tallyBillNo: voucherNo });
      });

      await batch.commit();
    }
    return voucherNo;
  } catch (e) {
    console.error("Voucher fetch failed:", e);
    return undefined;
  }
}


export async function sendInvoiceToTally(
  invoice: Invoice
): Promise<{ success: boolean; message: string; voucherNumber?: string }> {
  // 1) Ensure Ledger exists for the customer
  await createIfNeeded(
    await buildLedgerCreateXML(invoice.customer.name, invoice.customer.phone)
  );
  console.log("bhej diya")
  // 2) Create the Sales Voucher
  const voucherXml = await buildSalesVoucherXML(invoice);
  
  
  // Save XML before sending for better debugging
  await adminDb.collection('invoices').doc(invoice.id).set({ tallySalesXml: voucherXml }, { merge: true });
  
  const voucherResult = await createIfNeeded(voucherXml);

  if (!voucherResult.success) {
      return {
          success: false,
          message: `Tally voucher creation failed: ${voucherResult.message}`
      };
  }

  // 3) On successful creation, fetch the voucher number
  await new Promise(resolve => setTimeout(resolve, 2000)); // Small delay to allow Tally to process
  const voucherNumber = await fetchAndSaveVoucherNumber(invoice);
  
  return {
    success: true,
    message:
      (voucherResult.message) +
      (voucherNumber ? ` Voucher No: ${voucherNumber}` : ' Could not fetch voucher number.'),
    voucherNumber,
  };
}



export async function getStockFromTally(itemName: string): Promise<{ success: boolean, quantity: number | null, message: string }> {
  const xml = `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Object</TYPE>
        <SUBTYPE>StockItem</SUBTYPE>
        <ID TYPE="Name">${escapeXml(itemName)}</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
          <FETCHLIST>
                <FETCH>Name</FETCH>
                <FETCH>ClosingBalance</FETCH>
                <FETCH>BilledQty</FETCH>
                <FETCH>ClosingQty</FETCH>
          </FETCHLIST>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  try {
    const responseXml = await httpPostXml(xml);
    console.log(`Tally response for ${itemName}:`, responseXml);
    const parsed = await xml2js.parseStringPromise(responseXml, { explicitArray: false, trim: true });
    
    // Updated path to navigate the parsed object correctly
    const closingBalanceNode = parsed?.ENVELOPE?.BODY?.DATA?.TALLYMESSAGE?.STOCKITEM?.CLOSINGBALANCE?._;
    
    if (closingBalanceNode && typeof closingBalanceNode === 'string') {
        const balanceText = closingBalanceNode;
        const match = balanceText.match(/^(-?\d+(\.\d+)?)/);
        const quantity = match ? parseFloat(match[1]) : 0;
        return { success: true, quantity: isNaN(quantity) ? 0 : quantity, message: 'Success' };
    }
    
    return { success: true, quantity: 0, message: 'Stock item not found in Tally or has no balance.' };

  } catch (error: any) {
    console.error(`Tally stock fetch error for ${itemName}:`, error.message);
    return { success: false, quantity: null, message: `Tally stock fetch error: ${error.message}` };
  }
}

export async function getFirestoreStockQuantity(itemName: string): Promise<{ success: boolean; quantity: number | null; message: string; }> {
    try {
        const stockId = itemName.replace(/\//g, '-');
        const stockRef = adminDb.collection('stocks').doc(stockId);
        const docSnap = await stockRef.get();
        if (docSnap.exists) {
            const quantity = docSnap.data()?.quantity || 0;
            return { success: true, quantity: quantity, message: 'Success' };
        }
        return { success: false, quantity: null, message: `Stock item ${itemName} not found in Firestore.` };
    } catch (error: any) {
        return { success: false, quantity: null, message: error.message };
    }
}

    