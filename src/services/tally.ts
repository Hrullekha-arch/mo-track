
'use server';

import { Invoice } from '@/lib/types';
import { format } from 'date-fns';

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

function buildLedgerCreateXML(customerName: string, customerPhone: string): string {
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
                        <MOBILENUMBER>${escapeXml(customerPhone)}</MOBILENUMBER>
                    </LEDGER>
                </TALLYMESSAGE>
            </DATA>
        </BODY>
    </ENVELOPE>
    `;
}

function buildStockItemCreateXML(itemName: string): string {
    const escapedItemName = escapeXml(itemName);
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
                        <SVCURRENTCOMPANY>Mo Designs</SVCURRENTCOMPANY>
                    </STATICVARIABLES>
                </REQUESTDESC>
                <REQUESTDATA>
                    <TALLYMESSAGE xmlns:UDF="TallyUDF">
                        <STOCKITEM NAME="${escapedItemName}" RESERVEDNAME="">
                            <PARENT>Primary</PARENT>
                            <BASEUNITS>Nos</BASEUNITS>
                        </STOCKITEM>
                    </TALLYMESSAGE>
                </REQUESTDATA>
            </IMPORTDATA>
        </BODY>
    </ENVELOPE>
    `;
}


function buildSalesVoucherXML(invoice: Invoice): string {
  const date = format(new Date(invoice.createdAt), 'yyyyMMdd');
  // Use the new standardized ledger name format
  const partyLedgerName = escapeXml(`${invoice.customer.name} (${invoice.customer.phone})`);
  const salesLedger = "Sales Accounts";
  
  const { grandTotal } = invoice.totals;

  let inventoryEntries = '';
  invoice.items.forEach(item => {
    const itemAmount = item.rate * item.quantityAllocated;
    inventoryEntries += `
      <ALLINVENTORYENTRIES.LIST>
        <STOCKITEMNAME>${escapeXml(item.itemName)}</STOCKITEMNAME>
        <RATE>${item.rate.toFixed(2)}/Nos</RATE>
        <AMOUNT>${itemAmount.toFixed(2)}</AMOUNT>
        <ACTUALQTY>${item.quantityAllocated.toFixed(2)} Nos</ACTUALQTY>
        <BILLEDQTY>${item.quantityAllocated.toFixed(2)} Nos</BILLEDQTY>
        <BATCHALLOCATIONS.LIST>
            <GODOWNNAME>Main Location</GODOWNNAME>
            <BATCHNAME>Primary Batch</BATCHNAME>
            <AMOUNT>${itemAmount.toFixed(2)}</AMOUNT>
            <ACTUALQTY>${item.quantityAllocated.toFixed(2)} Nos</ACTUALQTY>
            <BILLEDQTY>${item.quantityAllocated.toFixed(2)} Nos</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>
        <ACCOUNTINGALLOCATIONS.LIST>
            <LEDGERNAME>${salesLedger}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <AMOUNT>${itemAmount.toFixed(2)}</AMOUNT>
        </ACCOUNTINGALLOCATIONS.LIST>
      </ALLINVENTORYENTRIES.LIST>
    `;
  });

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
                <DATE>${date}</DATE>
                <VOUCHERNUMBER>${invoice.invoiceNo}</VOUCHERNUMBER>
                <PARTYNAME>${partyLedgerName}</PARTYNAME>
                <PARTYLEDGERNAME>${partyLedgerName}</PARTYLEDGERNAME>
                <BASICBUYERNAME>${partyLedgerName}</BASICBUYERNAME>
                <STATENAME>HARYANA</STATENAME> 
                <PLACEOFSUPPLY>HARYANA</PLACEOFSUPPLY>
                <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
                <VCHENTRYMODE>Item Invoice</VCHENTRYMODE>
                <ISINVOICE>Yes</ISINVOICE>
                ${inventoryEntries}
                <LEDGERENTRIES.LIST>
                    <LEDGERNAME>${partyLedgerName}</LEDGERNAME>
                    <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                    <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
                    <AMOUNT>-${grandTotal.toFixed(2)}</AMOUNT>
                    <BILLALLOCATIONS.LIST>
                        <NAME>${invoice.invoiceNo}</NAME>
                        <BILLTYPE>New Ref</BILLTYPE>
                        <AMOUNT>-${grandTotal.toFixed(2)}</AMOUNT>
                    </BILLALLOCATIONS.LIST>
                </LEDGERENTRIES.LIST>
              </VOUCHER>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>
  `;
}

async function parseTallyResponse(xmlString: string): Promise<{ success: boolean; voucherNumber?: string; message: string }> {
    const successMatch = xmlString.match(/<CREATED>1<\/CREATED>/) || xmlString.match(/<ALTERED>1<\/ALTERED>/);
    if (successMatch) {
        const voucherNumberMatch = xmlString.match(/<VOUCHERNUMBER>(.*?)<\/VOUCHERNUMBER>/);
        return {
            success: true,
            voucherNumber: voucherNumberMatch ? voucherNumberMatch[1] : undefined,
            message: "Successfully created/updated voucher in Tally."
        };
    }
    
    const statusMatch = xmlString.match(/<STATUS>(.*?)<\/STATUS>/);
    if (statusMatch && statusMatch[1] === '0') {
        const errorMatch = xmlString.match(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/);
        if (errorMatch) {
            return { success: false, message: `Tally Error: ${errorMatch[1].trim()}` };
        }
        return { success: false, message: "Tally reported a failure with status 0." };
    }

    const lineErrorMatch = xmlString.match(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/);
    if (lineErrorMatch) {
        const errorMessage = lineErrorMatch[1].trim();
        if (/name already exists/i.test(errorMessage)) {
             return { success: true, message: `Master already exists: ${errorMessage}` };
        }
        return { success: false, message: `Tally Error: ${errorMessage}` };
    }

    // Capture the entire XML for unknown errors
    return { success: false, message: `Unknown error from Tally. Full response: ${xmlString}` };
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
    const ledgerXml = buildLedgerCreateXML(invoice.customer.name, invoice.customer.phone);
    const ledgerResult = await postToTally(ledgerXml);
    if (!ledgerResult.success) {
        return { success: false, message: `Failed to create customer ledger: ${ledgerResult.message}` };
    }

    // Step 2: Ensure all Stock Items exist
    for (const item of invoice.items) {
        const itemXml = buildStockItemCreateXML(item.itemName);
        const itemResult = await postToTally(itemXml);
        if (!itemResult.success) {
            return { success: false, message: `Failed to create stock item ${item.itemName}: ${itemResult.message}` };
        }
    }

    // Step 3: Create the Sales Voucher
    const voucherXml = buildSalesVoucherXML(invoice);
    const voucherResult = await postToTally(voucherXml);

    if (voucherResult.success) {
        const finalParsedResponse = await parseTallyResponse(voucherResult.responseXml!);
        return { 
            success: true, 
            message: "Sales voucher created successfully.", 
            voucherNumber: finalParsedResponse.voucherNumber 
        };
    } else {
        return { success: false, message: `Failed to create sales voucher: ${voucherResult.message}` };
    }
}
