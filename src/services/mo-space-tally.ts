

'use server';

import { Invoice } from '@/lib/types';
import { format } from 'date-fns';

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

export async function buildMoSpaceSalesVoucherXML(invoice: Invoice): Promise<{xml: string, roundedTotal: number, partyLedgerName: string, date: string}> {
    const money = (n: number) => (Math.round(n * 100) / 100);
    const fmt = (n: number) => money(n).toFixed(2);
    
    const date = format(new Date(), 'yyyyMMdd');
    const partyLedgerName = escapeXml(`${invoice.customer.name}-${invoice.customer.phone}`);
    const companyName = "MO SPACES PVT.LTD.";
    const voucherType = "Installation / Stitching";
    
    let salesmanRefText = invoice.salesPerson;
    
    const totalQty = invoice.items.reduce((sum, item) => sum + item.quantityAllocated, 0);
    const firstItemName = invoice.items[0]?.itemName || 'items';
    const narration = escapeXml(`Sale of ${firstItemName}`);
    const stateName = "Haryana"; 
  
    let inventoryEntries = '';

    for (const item of invoice.items) {
        const gstPercent = (item as any).gstPercent || 18; 
        const salesLedgerName = `Haryana Stitching Services @ ${gstPercent}%`;
  
        const qty = money(Number(item.quantityAllocated || 0));
        const rate = money(Number(item.rate || 0));
        
        // Use the pre-calculated taxable amount from the payload
        const itemTaxableValue = money((item as any).taxableAmount || (rate * qty));
        
        inventoryEntries += `
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${escapeXml(item.bcn)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <ACTUALQTY>${qty} Pcs</ACTUALQTY>
              <BILLEDQTY>${qty} Pcs</BILLEDQTY>
              <RATE>${fmt(rate)}/Pcs</RATE>
              <AMOUNT>${fmt(itemTaxableValue)}</AMOUNT>
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>${escapeXml(salesLedgerName)}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <AMOUNT>${fmt(itemTaxableValue)}</AMOUNT>
              </ACCOUNTINGALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>`;
    }

    const { roundedTotal, cgst, sgst } = invoice.totals;
    
    let partyDebitLedger = `<LEDGERENTRIES.LIST>
              <LEDGERNAME>${partyLedgerName}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <AMOUNT>-${fmt(roundedTotal)}</AMOUNT>
            </LEDGERENTRIES.LIST>`;
    
    let taxLedgers = '';

    if (cgst > 0) {
        taxLedgers += `
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>Output CGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${fmt(cgst)}</AMOUNT>
            </LEDGERENTRIES.LIST>`;
    }
  
    if (sgst > 0) {
        taxLedgers += `
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>Output SGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${fmt(sgst)}</AMOUNT>
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
