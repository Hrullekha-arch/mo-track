
'use server';

import { Invoice } from '@/lib/types';
import { adminDb } from '@/lib/firebase-admin';
import { doc, updateDoc } from 'firebase-admin/firestore';
import axios from "axios";
import xml2js from 'xml2js';

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
  const money = (n: number) => (Math.round(n * 100) / 100);
  const fmt = (n: number) => money(n).toFixed(2);

  const date = '20250401'; // test
  const partyLedgerName = escapeXml(`${invoice.customer.name} (${invoice.customer.phone})`);
  const salesLedger = "Sales Accounts";

  const state = "Delhi";
  const placeOfSupply = "Delhi";

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

  const partyAmount = money(itemSubtotal + cgst + sgst);

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
            <STATENAME>${state}</STATENAME>
            <PLACEOFSUPPLY>${placeOfSupply}</PLACEOFSUPPLY>
            <PARTYNAME>${partyLedgerName}</PARTYNAME>
            <PARTYLEDGERNAME>${partyLedgerName}</PARTYLEDGERNAME>
            <BASICBUYERNAME>${partyLedgerName}</BASICBUYERNAME>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VCHENTRYMODE>Item Invoice</VCHENTRYMODE>
            <ISINVOICE>Yes</ISINVOICE>
            ${inventoryEntries}
            ${cgstLedgerEntry}
            ${sgstLedgerEntry}
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
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}


// ---------------- Networking ----------------

async function postToTally(xmlRequest: string): Promise<{ success: boolean; message: string; responseXml?: string }> {
    const tallyUrl = process.env.TALLY_SERVER_URL;
    if (!tallyUrl) {
      return { success: false, message: "TALLY_SERVER_URL environment variable is not set." };
    }
    try {
        const response = await axios.post(tallyUrl, xmlRequest, {
            headers: { "Content-Type": "text/xml" },
        });
        const responseXml = response.data;
        const parsedResult = await xml2js.parseStringPromise(responseXml, { explicitArray: false, trim: true });
        
        if (parsedResult.RESPONSE.CREATED === '1' || parsedResult.RESPONSE.ALTERED === '1') {
            return { success: true, message: "Created/updated successfully in Tally.", responseXml };
        } else {
             const error = parsedResult.RESPONSE.LINEERROR || "Unknown Tally error.";
             return { success: false, message: error, responseXml };
        }
    } catch (err: any) {
        return { success: false, message: `Connection error: ${err.message}` };
    }
}

// ---------------- Voucher Fetcher ----------------

export async function fetchAndSaveVoucherNumber(invoice: Invoice): Promise<string | undefined> {
    const ledgerName = escapeXml(`${invoice.customer.name} (${invoice.customer.phone})`);
    const amount = invoice.totals.grandTotal.toFixed(2);

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
                            $LedgerName = $$String:"${ledgerName}"
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
        const tallyUrl = process.env.TALLY_SERVER_URL;
        if (!tallyUrl) {
            console.error("TALLY_SERVER_URL is not set.");
            return undefined;
        }
        const tallyResponse = await axios.post(tallyUrl, requestXML, {
            headers: { "Content-Type": "text/xml" },
        });

        const parsed = await xml2js.parseStringPromise(tallyResponse.data, { explicitArray: false });
        
        const voucherNumber = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER?.VOUCHERNUMBER;

        if (voucherNumber) {
            const invoiceRef = doc(adminDb, "invoices", invoice.id);
            await updateDoc(invoiceRef, { tallyVoucherNo: voucherNumber });
            return voucherNumber;
        }
        return undefined;
    } catch (err: any) {
        console.error("Voucher fetch failed:", err.message);
        return undefined;
    }
}

// ---------------- Main ----------------

export async function sendInvoiceToTally(invoice: Invoice): Promise<{ success: boolean; message: string; voucherNumber?: string }> {
    // 1. Ensure Ledger and Stock Items exist
    await postToTally(await buildLedgerCreateXML(invoice.customer.name, invoice.customer.phone));
    for (const item of invoice.items) {
        await postToTally(await buildStockItemCreateXML(item.itemName));
    }

    // 2. Create the Sales Voucher
    const voucherXml = await buildSalesVoucherXML(invoice);
    const voucherResult = await postToTally(voucherXml);

    // 3. Save the generated XML to Firestore for logging/debugging
    const invoiceRef = doc(adminDb, "invoices", invoice.id);
    await updateDoc(invoiceRef, { tallySalesXml: voucherXml });

    if (!voucherResult.success) {
        return voucherResult;
    }

    // 4. Fetch and save the voucher number from Tally
    const finalVoucherNo = await fetchAndSaveVoucherNumber(invoice);

    return {
        success: true,
        message: `Voucher created successfully.` + (finalVoucherNo ? ` Tally Voucher No: ${finalVoucherNo}` : " Could not retrieve voucher number."),
        voucherNumber: finalVoucherNo
    };
}
