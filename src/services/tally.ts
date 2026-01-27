
'use server';

import { Invoice, Stock, TaxDetail, User, InvoiceBatch, VasDetail } from '@/lib/types';
import { adminDb } from '@/lib/firebase-admin';
import xml2js from 'xml2js';
import { doc, updateDoc, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { format } from 'date-fns';
import { buildMoSpaceSalesVoucherXML } from './mo-space-tally';

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
    signal: AbortSignal.timeout(30000) // 30-second timeout
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

async function extractVoucherNumber(xml: string): Promise<string | undefined> {
  try {
    const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false, trim: true });
    const vouchers = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER;
    if (!vouchers) return undefined;
    const voucherArray = Array.isArray(vouchers) ? vouchers : [vouchers];
    if (voucherArray.length === 0) return undefined;
    const voucherNumbers = voucherArray.map(v => parseInt(v?.VOUCHERNUMBER?.trim() || '0', 10)).filter(n => !isNaN(n));
    if (voucherNumbers.length === 0) return undefined;
    return String(Math.max(...voucherNumbers));
  } catch (err) {
    return undefined;
  }
}

// ---------------- XML Builders ----------------

async function buildLedgerCreateXML(customerName: string, customerPhone: string, state: string = 'Haryana'): Promise<string> {
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
      <ISBILLWISEON>No</ISBILLWISEPROVISIONAL>No</ISBILLWISEPROVISIONAL>
      <OPENINGBALANCE>0</OPENINGBALANCE>
     </LEDGER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`.trim();
}

async function buildStockItemCreateXML(bcn: string, isVas: boolean): Promise<string> {
    const escapedItemName = escapeXml(bcn);
    const companyName = isVas ? "MO SPACES PVT.LTD." : "MO Designs Private Limited - (2024-2025)";
    const unit = isVas ? 'Pcs' : 'mtr';

    return `
  <ENVELOPE>
    <HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>All Masters</ID></HEADER>
    <BODY>
      <DESC><STATICVARIABLES><SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY></STATICVARIABLES></DESC>
      <DATA>
        <TALLYMESSAGE>
          <STOCKITEM NAME="${escapedItemName}" ACTION="Create">
            <NAME>${escapedItemName}</NAME>
            <PARENT>Products</PARENT>
            <BASEUNITS>${unit}</BASEUNITS>
          </STOCKITEM>
        </TALLYMESSAGE>
      </DATA>
    </BODY>
  </ENVELOPE>`.trim();
}


export async function buildSalesVoucherXML(invoice: Invoice, isVas: boolean): Promise<{xml: string, roundedTotal: number, partyLedgerName: string, date: string}> {
    if (isVas) {
        return buildMoSpaceSalesVoucherXML(invoice);
    }
    
    const money = (n: number) => (Math.round(n * 100) / 100);
    const fmt = (n: number) => money(n).toFixed(2);
    
    const date = format(new Date(), 'yyyyMMdd');
    const partyLedgerName = escapeXml(`${invoice.customer.name}-${invoice.customer.phone}`);
    const companyName = "MO Designs Private Limited - (2024-2025)";
    const voucherType = "Sales";
    
    let salesmanRefText = invoice.salesPerson;
    
    const totalQty = invoice.items.reduce((sum, item) => sum + item.quantityAllocated, 0);
    const firstItemName = invoice.items[0]?.itemName || 'items';
    const narration = escapeXml(`Sale of ${totalQty} mtr of ${firstItemName}`);
    const stateName = "Haryana"; 
  
    // CONSOLIDATE ITEMS
    const consolidatedItems = invoice.items.reduce((acc, item) => {
        const key = `${item.bcn}-${item.rate}-${item.discountPercent}`;
        if (!acc[key]) {
            acc[key] = { ...item, quantityAllocated: 0 };
        }
        acc[key].quantityAllocated += item.quantityAllocated;
        return acc;
    }, {} as Record<string, typeof invoice.items[0]>);

    let inventoryEntries = '';

    for (const item of Object.values(consolidatedItems)) {
        await createIfNeeded(await buildStockItemCreateXML(item.bcn, isVas));
        
        const gstPercent = ((item as any).gstPercent || 5);
        const salesLedgerName = `Haryana Sale @ ${gstRate}%`;
  
        const qty = money(Number(item.quantityAllocated || 0));
        const rate = money(Number(item.rate || 0));
        const lineAmount = money(rate * qty);
        const discountPercent = money(item.discountPercent || 0);
        const itemTaxableValue = money(lineAmount * (1 - discountPercent / 100));
        
        inventoryEntries += `
            <ALLINVENTORYENTRIES.LIST>
                <STOCKITEMNAME>${escapeXml(item.bcn)}</STOCKITEMNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <RATE>${fmt(rate)}/mtr</RATE>
                <DISCOUNT>${fmt(discountPercent)}</DISCOUNT>
                <AMOUNT>${fmt(itemTaxableValue)}</AMOUNT>
                <ACTUALQTY>${qty} mtr</ACTUALQTY>
                <BILLEDQTY>${qty} mtr</BILLEDQTY>
                <ACCOUNTINGALLOCATIONS.LIST>
                    <LEDGERNAME>${escapeXml(salesLedgerName)}</LEDGERNAME>
                    <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                    <AMOUNT>${fmt(itemTaxableValue)}</AMOUNT>
                </ACCOUNTINGALLOCATIONS.LIST>
                <BATCHALLOCATIONS.LIST>
                <GODOWNNAME>Mo</GODOWNNAME>
                <BATCHNAME>Primary Batch</BATCHNAME>
                <AMOUNT>${fmt(itemTaxableValue)}</AMOUNT>
                <ACTUALQTY>${qty} mtr</ACTUALQTY>
                <BILLEDQTY>${qty} mtr</BILLEDQTY>
                </BATCHALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>`;
    }

    const { roundedTotal, totalCgst, totalSgst, roundOff } = invoice.totals;
    
    let partyDebitLedger = `<LEDGERENTRIES.LIST>
            <LEDGERNAME>${partyLedgerName}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
            <AMOUNT>-${fmt(roundedTotal)}</AMOUNT>
        </LEDGERENTRIES.LIST>`;
    
    let taxLedgers = '';

    if (totalCgst > 0) {
        taxLedgers += `<LEDGERENTRIES.LIST>
            <LEDGERNAME>Output CGST</LEDGERNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <AMOUNT>${fmt(totalCgst)}</AMOUNT>
        </LEDGERENTRIES.LIST>`;
    }
  
    if (totalSgst > 0) {
        taxLedgers += `<LEDGERENTRIES.LIST>
            <LEDGERNAME>Output SGST</LEDGERNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <AMOUNT>${fmt(totalSgst)}</AMOUNT>
        </LEDGERENTRIES.LIST>`;
    }
        
    if (roundOff !== 0) {
      taxLedgers += `<LEDGERENTRIES.LIST>
          <LEDGERNAME>Round Off</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${roundOff > 0 ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>
          <AMOUNT>${fmt(Math.abs(roundOff))}</AMOUNT>
        </LEDGERENTRIES.LIST>`;
    }
  
    const xml = `
  <ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="${voucherType}" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${date}</DATE>
            <VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME>
            <REFERENCE>${escapeXml(salesmanRefText)}</REFERENCE>
            <ISINVOICE>Yes</ISINVOICE>
            <PARTYLEDGERNAME>${partyLedgerName}</PARTYLEDGERNAME>
            <PARTYNAME>${partyLedgerName}</PARTYNAME>
            <BASICBUYERNAME>${partyLedgerName}</BASICBUYERNAME>
            <PARTYMAILINGNAME>${partyLedgerName}</PARTYMAILINGNAME>
            <STATENAME>${stateName}</STATENAME>
            <PLACEOFSUPPLY>${stateName}</PLACEOFSUPPLY>
            <NARRATION>${narration}</NARRATION>
            ${partyDebitLedger}
            ${inventoryEntries}
            ${taxLedgers}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
  </ENVELOPE>`.trim();

  return { xml, roundedTotal, partyLedgerName, date };
}

async function buildVoucherFilterXML(ledgerName: string, amount: number, date: string, companyName: string): Promise<string> {
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
        <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>
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
            $VoucherTypeName = $$String:"Sales" OR $VoucherTypeName = $$String:"Installation / Stitching"
          </SYSTEM>
          <SYSTEM TYPE="Formulae" NAME="FilterByLedgerName">
            $LedgerName = $$String:"${escapeXml(ledgerName)}"
          </SYSTEM>
          <SYSTEM TYPE="Formulae" NAME="FilterByAmount">
            $Amount = ${amount}
          </SYSTEM>
            <SYSTEM TYPE="Formulae" NAME="FilterByDate">
                $Date = $$Date:"${date}"
            </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`.trim();
}

async function createIfNeeded(xml: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await httpPostXml(xml);
    const ok = tallyCreateOk(res);
    return { success: ok, message: res };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

async function fetchAndSaveVoucherNumber(invoice: Invoice, ledgerName: string, amount: number, date: string, isVas: boolean): Promise<string | undefined> {
  const companyName = isVas ? "MO SPACES PVT.LTD." : "MO Designs Private Limited - (2024-2025)";
  const filterXml = await buildVoucherFilterXML(ledgerName, amount, date, companyName);

  let voucherNo: string | undefined;
  for (let attempt = 0; attempt < 3 && !voucherNo; attempt++) {
    await new Promise(r => setTimeout(r, 5000)); 
    const xml = await httpPostXml(filterXml);
    voucherNo = await extractVoucherNumber(xml);
  }

  if (voucherNo) {
    const batch = adminDb.batch();
    batch.update(adminDb.collection("invoices").doc(invoice.id), { tallyVoucherNo: voucherNo, invoiceNo: voucherNo });
    const batchesSnap = await adminDb.collection("invoiceBatches").where("invoiceId", "==", invoice.id).get();
    batchesSnap.forEach(docSnap => batch.update(docSnap.ref, { tallyVoucherNo: voucherNo }));
    await batch.commit();
  }

  return voucherNo;
}


export async function sendInvoiceToTally(
  invoice: Invoice,
  isVas: boolean = false
): Promise<{ success: boolean; message: string; voucherNumber?: string }> {
  // 1) Ensure Ledger exists for the customer
  await createIfNeeded(
    await buildLedgerCreateXML(invoice.customer.name, invoice.customer.phone)
  );
  
  // 2) Create the Sales Voucher
  const { xml: voucherXml, roundedTotal, partyLedgerName, date } = await buildSalesVoucherXML(invoice, isVas);
  
  await adminDb.collection('invoices').doc(invoice.id).set({ tallySalesXml: voucherXml }, { merge: true });
  
  const voucherResult = await createIfNeeded(voucherXml);

  if (!voucherResult.success) {
      return {
          success: false,
          message: `Tally voucher creation failed: ${voucherResult.message}`
      };
  }

  // 3) On successful creation, fetch the voucher number
  await new Promise(resolve => setTimeout(resolve, 5000));
  const voucherNumber = await fetchAndSaveVoucherNumber(invoice, partyLedgerName, roundedTotal, date, isVas);
  
  return {
    success: true,
    message:
      (voucherResult.message) +
      (voucherNumber ? ` Voucher No: ${voucherNumber}` : ' Could not fetch voucher number.'),
    voucherNumber,
  };
}



export async function getStockFromTally(bcn: string): Promise<{ success: boolean, quantity: number | null, message: string }> {
  const xml = `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Object</TYPE>
        <SUBTYPE>StockItem</SUBTYPE>
        <ID TYPE="Name">${escapeXml(bcn)}</ID>
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
    const parsed = await xml2js.parseStringPromise(responseXml, { explicitArray: false, trim: true });
    
    const closingBalanceNode = parsed?.ENVELOPE?.BODY?.DATA?.TALLYMESSAGE?.STOCKITEM?.CLOSINGBALANCE?._;
    
    if (closingBalanceNode && typeof closingBalanceNode === 'string') {
        const balanceText = closingBalanceNode;
        const match = balanceText.match(/^(-?\d+(\.\d+)?)/);
        const quantity = match ? parseFloat(match[1]) : 0;
        return { success: true, quantity: isNaN(quantity) ? 0 : quantity, message: 'Success' };
    }
    
    return { success: true, quantity: 0, message: 'Stock item not found in Tally or has no balance.' };

  } catch (error: any) {
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
