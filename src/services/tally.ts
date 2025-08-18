
'use server';

import { Invoice } from '@/lib/types';
import { format } from 'date-fns';

function escapeXml(unsafe: string): string {
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

function buildSalesVoucherXML(invoice: Invoice): string {
  const date = format(new Date(invoice.createdAt), 'yyyyMMdd');
  const customerName = escapeXml(invoice.customer.name);
  const salesLedger = "Sales Accounts"; // As per new XML
  
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
                <PARTYNAME>${customerName}</PARTYNAME>
                <PARTYLEDGERNAME>${customerName}</PARTYLEDGERNAME>
                <BASICBUYERNAME>${customerName}</BASICBUYERNAME>
                <STATENAME>HARYANA</STATENAME> 
                <PLACEOFSUPPLY>HARYANA</PLACEOFSUPPLY>
                <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
                <VCHENTRYMODE>Item Invoice</VCHENTRYMODE>
                <ISINVOICE>Yes</ISINVOICE>
                ${inventoryEntries}
                <LEDGERENTRIES.LIST>
                    <LEDGERNAME>${customerName}</LEDGERNAME>
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
    // A simple parser for Tally's response. A robust solution might use an XML parsing library.
    const successMatch = xmlString.match(/<STATUS>(.*?)<\/STATUS>/);
    if (successMatch && successMatch[1] === '1') {
        const voucherNumberMatch = xmlString.match(/<VOUCHERNUMBER>(.*?)<\/VOUCHERNUMBER>/);
        return {
            success: true,
            voucherNumber: voucherNumberMatch ? voucherNumberMatch[1] : undefined,
            message: "Successfully created voucher in Tally."
        };
    } else {
        const errorMatch = xmlString.match(/<LINEERROR>(.*?)<\/LINEERROR>/);
        const message = errorMatch ? `Tally Error: ${errorMatch[1]}` : "Unknown error from Tally.";
        return { success: false, message };
    }
}


export async function sendInvoiceToTally(invoice: Invoice): Promise<{ success: boolean; message: string; voucherNumber?: string }> {
    const tallyUrl = process.env.TALLY_SERVER_URL;
    if (!tallyUrl) {
        throw new Error("Tally server URL is not configured in environment variables.");
    }

    const xmlRequest = buildSalesVoucherXML(invoice);
    
    try {
        const response = await fetch(tallyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml' },
            body: xmlRequest,
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }
        
        const responseXml = await response.text();
        return await parseTallyResponse(responseXml);

    } catch (error: any) {
        console.error("Failed to send request to Tally:", error);
        return {
            success: false,
            message: `Could not connect to Tally server at ${tallyUrl}. Please ensure Tally is running and accessible. Error: ${error.message}`
        };
    }
}
