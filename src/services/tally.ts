

'use server';

import { Invoice } from '@/lib/types';
import { adminDb } from '@/lib/firebase-admin';
import xml2js from 'xml2js';
import { doc, updateDoc } from 'firebase/firestore';

// ---------------- Helpers ----------------

function escapeXml(unsafe: string): string {
  if (typeof unsafe !== 'string') return '';
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
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
  const matches = [...xml.matchAll(/<VOUCHERNUMBER>([^<]+)<\/VOUCHERNUMBER>/g)];
  return matches.length ? matches[matches.length - 1][1] : undefined;
}

// ---------------- XML Builders ----------------

export async function buildLedgerCreateXML(customerName: string, customerPhone: string): Promise<string> {
  const ledgerName = escapeXml(`${customerName} (${customerPhone})`);
  return `
<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>All Masters</ID></HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES><SVCURRENTCOMPANY>Mo Designs</SVCURRENTCOMPANY></STATICVARIABLES>
    </DESC>
    <DATA>
      <TALLYMESSAGE>
        <LEDGER NAME="${ledgerName}" ACTION="Create">
          <NAME>${ledgerName}</NAME>
          <PARENT>Sundry Debtors</PARENT>
          <ISBILLWISEON>Yes</ISBILLWISEON>
        </LEDGER>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`.trim();
}

export async function buildStockItemCreateXML(itemName: string): Promise<string> {
  const escapedItemName = escapeXml(itemName);
  return `
<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>All Masters</ID></HEADER>
  <BODY>
    <DESC><STATICVARIABLES><SVCURRENTCOMPANY>Mo Designs</SVCURRENTCOMPANY></STATICVARIABLES></DESC>
    <DATA>
      <TALLYMESSAGE>
        <STOCKITEM NAME="${escapedItemName}" ACTION="Create">
          <NAME>${escapedItemName}</NAME>
          <PARENT>Products</PARENT>
          <BASEUNITS>Nos</BASEUNITS>
        </STOCKITEM>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`.trim();
}

export async function buildSalesVoucherXML(invoice: Invoice): Promise<string> {
  // --- helpers ---
  const money = (n: number) => (Math.round(n * 100) / 100);
  const fmt = (n: number) => money(n).toFixed(2);

  // --- setup ---
  const date = '20250401'; // test
  const partyLedgerName = escapeXml(`${invoice.customer.name} (${invoice.customer.phone})`);
  const salesLedger = "Sales Accounts";

  // Force same-state so CGST/SGST both apply (adjust if your company state is different)
  const state = "Delhi";
  const placeOfSupply = "Delhi";

  // --- build inventory lines and compute subtotal from the same numbers we write ---
  let itemSubtotal = 0;
  let inventoryEntries = '';

  invoice.items.forEach(item => {
    const qty = Number(item.quantityAllocated || 0);
    const rate = Number(item.rate || 0);
    const lineAmount = money(rate * qty);
    itemSubtotal = money(itemSubtotal + lineAmount);

    inventoryEntries += `
      <ALLINVENTORYENTRIES.LIST>
        <STOCKITEMNAME>${escapeXml(item.itemName)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${fmt(rate)}/Nos</RATE>
        <AMOUNT>${fmt(lineAmount)}</AMOUNT>
        <ACTUALQTY>${fmt(qty)} Nos</ACTUALQTY>
        <BILLEDQTY>${fmt(qty)} Nos</BILLEDQTY>
        <ACCOUNTINGALLOCATIONS.LIST>
          <LEDGERNAME>${salesLedger}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${fmt(lineAmount)}</AMOUNT>
        </ACCOUNTINGALLOCATIONS.LIST>
      </ALLINVENTORYENTRIES.LIST>`;
  });

  const totalGST = money(itemSubtotal * 0.05);
  const cgst = money(totalGST / 2);
  const sgst = money(totalGST - cgst);
  const totalAmountBeforeRoundOff = money(itemSubtotal + cgst + sgst);
  const roundedPartyAmount = Math.round(totalAmountBeforeRoundOff);
  const roundOff = money(roundedPartyAmount - totalAmountBeforeRoundOff);
  
  const partyAmount = roundedPartyAmount;


  const cgstLedgerEntry = cgst > 0 ? `
    <LEDGERENTRIES.LIST>
      <LEDGERNAME>CGST 2.5%</LEDGERNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <AMOUNT>${fmt(cgst)}</AMOUNT>
    </LEDGERENTRIES.LIST>` : '';

  const sgstLedgerEntry = sgst > 0 ? `
    <LEDGERENTRIES.LIST>
      <LEDGERNAME>SGST 2.5%</LEDGERNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <AMOUNT>${fmt(sgst)}</AMOUNT>
    </LEDGERENTRIES.LIST>` : '';

  const roundOffLedgerEntry = roundOff !== 0 ? `
    <LEDGERENTRIES.LIST>
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
          <SVCURRENTCOMPANY>Mo Designs</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
            <DATE>${date}</DATE>
            <VOUCHERNUMBER>${invoice.invoiceNo}</VOUCHERNUMBER>
            <STATENAME>${state}</STATENAME>
            <PLACEOFSUPPLY>${placeOfSupply}</PLACEOFSUPPLY>
            <PARTYNAME>${partyLedgerName}</PARTYNAME>
            <PARTYLEDGERNAME>${partyLedgerName}</PARTYLEDGERNAME>
            <BASICBUYERNAME>${partyLedgerName}</BASICBUYERNAME>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VCHENTRYMODE>Item Invoice</VCHENTRYMODE>
            <ISINVOICE>Yes</ISINVOICE>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${partyLedgerName}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <AMOUNT>-${fmt(partyAmount)}</AMOUNT>
              <BILLALLOCATIONS.LIST>
                <NAME>${invoice.invoiceNo}</NAME>
                <BILLTYPE>New Ref</BILLTYPE>
                <AMOUNT>-${fmt(partyAmount)}</AMOUNT>
              </BILLALLOCATIONS.LIST>
            </LEDGERENTRIES.LIST>
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
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`.trim();
}

// ---------------- Main ops ----------------

async function createIfNeeded(xml: string): Promise<{ success: boolean; message: string; responseXml: string }> {
  try {
    const resp = await httpPostXml(xml);
    if (tallyCreateOk(resp)) {
      return { success: true, message: 'Created/updated successfully in Tally.', responseXml: resp };
    }
    const errLine = resp.match(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/)?.[1]?.trim() ?? 'Unknown Tally error.';
    return { success: false, message: errLine, responseXml: resp };
  } catch (e: any) {
    console.error("Tally Communication Error in createIfNeeded:", e);
    return { success: false, message: `Tally connection failed: ${e?.message || e}`, responseXml: '' };
  }
}

export async function fetchAndSaveVoucherNumber(invoice: Invoice): Promise<string | undefined> {
  const ledgerName = `${invoice.customer.name} (${invoice.customer.phone})`;
  const amount = Number(invoice?.totals?.grandTotal ?? 0);

  const filterXml = await buildVoucherFilterXML(escapeXml(ledgerName), amount);
  try {
    const xml = await httpPostXml(filterXml);
    const voucherNo = extractVoucherNumber(xml);
    if (voucherNo) {
      await adminDb.collection('invoices').doc(invoice.id).update({ tallyVoucherNo: voucherNo });
      return voucherNo;
    }
    return undefined;
  } catch (e) {
    console.error('Voucher fetch failed:', e);
    return undefined;
  }
}

export async function sendInvoiceToTally(
  invoice: Invoice
): Promise<{ success: boolean; message: string; voucherNumber?: string }> {
  // 1) Ensure Ledger
  await createIfNeeded(
    await buildLedgerCreateXML(invoice.customer.name, invoice.customer.phone)
  );

  // 2) Check stock for each item BEFORE creating voucher
  for (const item of invoice.items) {
    // Make sure stock item exists in Tally
    await createIfNeeded(await buildStockItemCreateXML(item.itemName));

    const stockCheck = await getStockFromTally(item.itemName);
    if (!stockCheck.success) {
      return {
        success: false,
        message: `Failed to fetch stock for ${item.itemName}: ${stockCheck.message}`,
      };
    }
    
    // The available quantity should be considered as the current Tally stock PLUS what we are about to deduct.
    // This prevents errors if this function runs moments after the Firestore stock is deducted.
    const effectiveAvailableQty = (stockCheck.quantity ?? 0) + item.quantityAllocated;

    if (stockCheck.quantity !== null && effectiveAvailableQty < item.quantityAllocated) {
      return {
        success: false,
        message: `Insufficient stock for ${item.itemName}. Available: ${stockCheck.quantity}, Required: ${item.quantityAllocated}`,
      };
    }
  }

  // 3) Create the Sales Voucher
  const voucherXml = await buildSalesVoucherXML(invoice);
  
  // Save XML before sending for better debugging
  await adminDb.collection('invoices').doc(invoice.id).update({ tallySalesXml: voucherXml });
  
  const voucherResult = await createIfNeeded(voucherXml);

  // 4) Always try to fetch the voucher number and save it
  const voucherNumber = await fetchAndSaveVoucherNumber(invoice);

  return {
    success: voucherResult.success,
    message:
      voucherResult.message +
      (voucherNumber ? ` Voucher No: ${voucherNumber}` : ' Could not fetch voucher number.'),
    voucherNumber,
  };
}


export async function getStockFromTally(itemName: string): Promise<{ success: boolean, quantity: number | null, message: string }> {
  const xml = `
    <ENVELOPE>
        <HEADER>
            <TALLYREQUEST>Export</TALLYREQUEST>
        </HEADER>
        <BODY>
            <EXPORTDATA>
                <REQUESTDESC>
                    <REPORTNAME>Stock Summary</REPORTNAME>
                    <STATICVARIABLES>
                        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                        <STOCKITEMNAME>${escapeXml(itemName)}</STOCKITEMNAME>
                    </STATICVARIABLES>
                </REQUESTDESC>
            </EXPORTDATA>
        </BODY>
    </ENVELOPE>`;
  try {
    const responseXml = await httpPostXml(xml);
    const parsed = await xml2js.parseStringPromise(responseXml, { explicitArray: false, trim: true });
    
    const closingBalance = parsed?.ENVELOPE?.STOCKITEM?.CLOSINGBALANCE;
    if (typeof closingBalance === 'string') {
        const quantity = parseFloat(closingBalance);
        return { success: true, quantity: isNaN(quantity) ? 0 : quantity, message: 'Success' };
    }
    return { success: true, quantity: 0, message: 'Stock item not found in Tally or has no balance.' };
  } catch (error: any) {
    console.error(`Tally stock fetch error for ${itemName}:`, error.message, `Response XML: ${error.responseXml || ''}`);
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
        return { success: true, quantity: 0, message: 'Stock not found in Firestore.' };
    } catch (error: any) {
        return { success: false, quantity: null, message: error.message };
    }
}
