
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
  const salesLedger = "Sales"; // Replace with your actual sales ledger name in Tally
  const cgstLedger = "CGST"; // Replace with your CGST ledger
  const sgstLedger = "SGST"; // Replace with your SGST ledger

  const {
      subTotal,
      taxableValue,
      cgst,
      sgst,
      grandTotal,
  } = invoice.totals;
  
  let inventoryEntries = '';
  invoice.items.forEach(item => {
    inventoryEntries += `
      <ALLINVENTORYENTRIES.LIST>
        <STOCKITEMNAME>${escapeXml(item.itemName)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${item.rate.toFixed(2)}/Mtr</RATE>
        <AMOUNT>${(item.rate * item.quantityAllocated).toFixed(2)}</AMOUNT>
        <ACTUALQTY>${item.quantityAllocated.toFixed(2)} Mtr</ACTUALQTY>
        <BILLEDQTY>${item.quantityAllocated.toFixed(2)} Mtr</BILLEDQTY>
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
          <REQUESTDATA>
            <TALLYMESSAGE xmlns:UDF="TallyUDF">
              <VOUCHER VCHTYPE="Sales" ACTION="Create">
                <DATE>${date}</DATE>
                <PARTYLEDGERNAME>${customerName}</PARTYLEDGERNAME>
                <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
                <VOUCHERNUMBER>${invoice.invoiceNo}</VOUCHERNUMBER>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>${customerName}</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-${grandTotal.toFixed(2)}</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>${salesLedger}</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>${taxableValue.toFixed(2)}</AMOUNT>
                  ${inventoryEntries}
                </ALLLEDGERENTRIES.LIST>
                 <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>${cgstLedger}</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>${cgst.toFixed(2)}</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                 <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>${sgstLedger}</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>${sgst.toFixed(2)}</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
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
