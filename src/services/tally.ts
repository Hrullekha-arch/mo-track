

'use server';

import { Invoice } from '@/lib/types';
import { format } from 'date-fns';
import { adminDb } from '@/lib/firebase-admin';
import { doc, updateDoc } from 'firebase/firestore';

function escapeXml(unsafe: string): string {
    if (typeof unsafe !== 'string') {
        return '';
    }
    return unsafe.replace(/[<>&'"]/g, function (c) {
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

export async function buildLedgerCreateXML(customerName: string, customerPhone: string): Promise<string> {
    const ledgerName = escapeXml(`${customerName} (${customerPhone})`);
    return `
    <ENVELOPE>
        <HEADER>
            <VERSION>1</VERSION>
            <TALLYREQUEST>Import</TALLYREQUEST>
            <TYPE>Data</TYPE>
            <ID>All Masters</ID>
        </HEADER>
        <BODY>
            <DESC>
                <STATICVARIABLES>
                    <SVCURRENTCOMPANY>Mo Designs</SVCURRENTCOMPANY>
                </STATICVARIABLES>
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
    </ENVELOPE>
    `;
}

export async function buildStockItemCreateXML(itemName: string): Promise<string> {
    const escapedItemName = escapeXml(itemName);
    return `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Import</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>All Masters</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVCURRENTCOMPANY>Mo Designs</SVCURRENTCOMPANY>
          </STATICVARIABLES>
        </DESC>
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
    </ENVELOPE>
    `;
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
            
            <!-- Party (Debit) = -(items + taxes) -->
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


async function parseTallyResponse(xmlString: string): Promise<{ success: boolean; voucherNumber?: string; message: string }> {
    const successMatch = xmlString.match(/<CREATED>1<\/CREATED>/) || xmlString.match(/<ALTERED>1<\/ALTERED>/);
    if (successMatch) {
        const voucherNumberMatch = xmlString.match(/<VOUCHERNUMBER>(.*?)<\/VOUCHERNUMBER>/);
        return {
            success: true,
            voucherNumber: voucherNumberMatch ? voucherNumberMatch[1] : undefined,
            message: "Successfully created/updated in Tally."
        };
    }
    
    const errorMatch = xmlString.match(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/);
    if (errorMatch) {
        const errorMessage = errorMatch[1].trim();
        if (/name already exists/i.test(errorMessage)) {
             return { success: true, message: `Master already exists: ${errorMessage}` };
        }
        return { success: false, message: `Tally Error: ${errorMessage}` };
    }
    
    const statusMatch = xmlString.match(/<STATUS>(.*?)<\/STATUS>/);
    if (statusMatch && statusMatch[1] === '0') {
        return { success: false, message: `Tally reported a failure with status 0. Full Response: ${xmlString}` };
    }

    return { success: false, message: `Unknown Tally response: ${xmlString}` };
}

async function postToTally(xmlRequest: string): Promise<{ success: boolean; message: string; responseXml?: string; }> {
    const tallyUrl = process.env.TALLY_SERVER_URL;
    if (!tallyUrl) {
        throw new Error("Tally server URL is not configured in environment variables.");
    }
    
    try {
        const response = await fetch(tallyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml' },
            body: xmlRequest,
        });

        const responseXml = await response.text();

        if (!response.ok) {
            console.error("Tally HTTP Error Response:", responseXml);
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }
        
        const parsedResponse = await parseTallyResponse(responseXml);
        return { ...parsedResponse, responseXml };

    } catch (error: any) {
        console.error("Failed to send request to Tally:", error.message);
        return {
            success: false,
            message: `Could not connect to Tally server. Error: ${error.message}`
        };
    }
}


export async function sendInvoiceToTally(invoice: Invoice): Promise<{ success: boolean; message: string; voucherNumber?: string }> {
    // Step 1: Ensure Customer Ledger exists
    const ledgerXml = await buildLedgerCreateXML(invoice.customer.name, invoice.customer.phone);
    const ledgerResult = await postToTally(ledgerXml);
    if (!ledgerResult.success) {
        return { success: false, message: `Failed to create customer ledger: ${ledgerResult.message}` };
    }

    // Step 2: Ensure all Stock Items exist
    for (const item of invoice.items) {
        const itemXml = await buildStockItemCreateXML(item.itemName);
        const itemResult = await postToTally(itemXml);
        if (!itemResult.success) {
            return { success: false, message: `Failed to create stock item ${item.itemName}: ${itemResult.message}` };
        }
    }

    // Step 3: Create the Sales Voucher and store the XML
    const voucherXml = await buildSalesVoucherXML(invoice);
    
    // Save the generated XML to the invoice document in Firestore.
    try {
        const invoiceRef = doc(adminDb, 'invoices', invoice.id);
        await updateDoc(invoiceRef, { tallySalesXml: voucherXml });
    } catch (error) {
        console.error("Error saving sales XML to Firestore:", error);
    }
    
    const voucherResult = await postToTally(voucherXml);

    if (voucherResult.success) {
        const finalParsedResponse = await parseTallyResponse(voucherResult.responseXml!);
        if (finalParsedResponse.voucherNumber) {
             const invoiceRef = doc(adminDb, "invoices", invoice.id);
             await updateDoc(invoiceRef, { tallyVoucherNo: finalParsedResponse.voucherNumber });
        }
        return { 
            success: true, 
            message: "Sales voucher created successfully.", 
            voucherNumber: finalParsedResponse.voucherNumber 
        };
    } else {
        return { success: false, message: `Failed to create sales voucher: ${voucherResult.message}` };
    }
}

    
