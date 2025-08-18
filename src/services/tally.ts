

'use server';

import { Invoice } from '@/lib/types';
import { adminDb } from '@/lib/firebase-admin';
import axios from "axios";
import xml2js from "xml2js";
import { doc, updateDoc } from 'firebase-admin/firestore';

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

async function postToTally(xml: string): Promise<any> {
  if (!process.env.TALLY_SERVER_URL) {
    console.error("Tally server URL is not configured in environment variables.");
    throw new Error("Tally integration is not configured.");
  }

  try {
    const response = await axios.post(process.env.TALLY_SERVER_URL, xml, {
      headers: { "Content-Type": "text/xml" },
    });
    return await xml2js.parseStringPromise(response.data);
  } catch (error: any) {
    console.error("Error posting to Tally:", error.message);
    throw new Error(`Failed to connect to Tally server. Please ensure Tally is running and the URL is correct. Error: ${error.message}`);
  }
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
    </ENVELOPE>`;
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
    </ENVELOPE>`;
}

export async function buildSalesVoucherXML(invoice: Invoice): Promise<string> {
  // --- helpers ---
  const money = (n: number) => (Math.round(n * 100) / 100); // banker's rounding not needed here
  const fmt = (n: number) => money(n).toFixed(2);

  // --- setup ---
  const date = '20250401'; // test
  const partyLedgerName = escapeXml(`${invoice.customer.name} (${invoice.customer.phone})`);
  const salesLedger = "Sales Accounts";

  // Force same-state so CGST/SGST both apply (adjust if your company state is different)
  const state = "Delhi";           // <- set to your company state
  const placeOfSupply = "Delhi";   // <- same as state for intra-state

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

  // --- compute taxes to match what we’ll post ---
  // If you want 5% GST split, compute on the rounded itemSubtotal:
  const totalGST = money(itemSubtotal * 0.05);
  const cgst = money(totalGST / 2);
  const sgst = money(totalGST - cgst); // keep pennies consistent

  // If your business logic sometimes posts IGST or only one tax, adjust here and
  // ALSO change the XML tax lines accordingly.

  const partyAmount = money(itemSubtotal + cgst + sgst); // what customer owes

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

            <!-- keep intra-state for CGST+SGST -->
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
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

// ---------------- Voucher Fetcher ----------------

export async function fetchAndSaveVoucherNumber(invoice: Invoice): Promise<string | undefined> {
  const partyLedgerName = escapeXml(`${invoice.customer.name} (${invoice.customer.phone})`);
  const amount = invoice.totals.grandTotal;

  const requestXML = `
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
                        $LedgerName = $$String:"${partyLedgerName}"
                    </SYSTEM>
                    <SYSTEM TYPE="Formulae" NAME="FilterByAmount">
                        $Amount = ${amount}
                    </SYSTEM>
                </TDLMESSAGE>
            </TDL>
        </DESC>
    </BODY>
  </ENVELOPE>`;

  try {
    const parsed = await postToTally(requestXML);

    const voucherNumber = parsed?.ENVELOPE?.BODY?.DATA?.[0]?.COLLECTION?.[0]?.VOUCHER?.[0]?.VOUCHERNUMBER?.[0];
    
    if (voucherNumber) {
      const invoiceRef = doc(adminDb, "invoices", invoice.id);
      await updateDoc(invoiceRef, { tallyVoucherNo: voucherNumber });
      console.log(`Firestore updated with tallyVoucherNo = ${voucherNumber}`);
      return voucherNumber;
    } else {
      console.warn("VoucherNumber not found in response!");
      return undefined;
    }
  } catch (err: any) {
    console.error("Voucher fetch failed:", err.message);
    return undefined;
  }
}

// ---------------- Main ----------------

export async function sendInvoiceToTally(invoice: Invoice): Promise<{ success: boolean; message: string; voucherNumber?: string }> {
    const voucherXml = await buildSalesVoucherXML(invoice);
    
    // 1. Save the generated XML to the invoice document
    const invoiceRef = doc(adminDb, "invoices", invoice.id);
    await updateDoc(invoiceRef, { tallySalesXml: voucherXml });
    
    // 2. Create Ledger and Stock Items first
    await postToTally(await buildLedgerCreateXML(invoice.customer.name, invoice.customer.phone));
    for (const item of invoice.items) {
        await postToTally(await buildStockItemCreateXML(item.itemName));
    }

    // 3. Post the actual Sales Voucher
    const parsedResponse = await postToTally(voucherXml);
    let success = false;
    let message = "Unknown Tally response.";

    if (parsedResponse.RESPONSE?.CREATED?.[0] === '1') {
      success = true;
      message = "Voucher created in Tally.";
    } else if (parsedResponse.RESPONSE?.ALTERED?.[0] === '1') {
      success = true;
      message = "Voucher altered in Tally.";
    } else if (parsedResponse.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.LINEERROR?.[0]) {
       message = `Tally Error: ${parsedResponse.ENVELOPE.BODY[0].DATA[0].LINEERROR[0]}`;
    }

    // 4. Always try to fetch the voucher number after posting
    const finalVoucherNo = await fetchAndSaveVoucherNumber(invoice);

    return {
        success: success,
        message: message,
        voucherNumber: finalVoucherNo
    };
}
