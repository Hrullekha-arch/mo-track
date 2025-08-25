
'use server';

import { Invoice, Stock, TaxDetail, User } from '@/lib/types';
import { adminDb } from '@/lib/firebase-admin';
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
    const orderDoc = await adminDb.collection('orders').doc(invoice.orderId).get();
    if (orderDoc.exists && orderDoc.data()?.representativeId) {
        const salesmanDoc = await adminDb.collection('users').doc(orderDoc.data()?.representativeId).get();
        if (salesmanDoc.exists) {
            const salesmanData = salesmanDoc.data() as User;
            salesmanRefText = `${salesmanData.name} (${salesmanData.salesmanCode || 'N/A'})`;
        }
    }
    
    const totalQty = invoice.items.reduce((sum, item) => sum + item.quantityAllocated, 0);
    const firstItemName = invoice.items[0]?.itemName || 'items';
    const narration = escapeXml(`Sale of ${firstItemName}`);
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
    let totalCgst = 0;
    let totalSgst = 0;

    for (const item of invoice.items) {
        const stockDetail = stockDetailsMap.get(item.bcn);
        const taxDetail = stockDetail?.hsnCode ? taxDetailsMap.get(stockDetail.hsnCode) : undefined;
        const gstRate = taxDetail?.gst ?? 18; 
        const unit = 'Pcs';
        const salesLedgerName = `Haryana Stitching Services @ ${gstRate}%`;
  
        const qty = money(Number(item.quantityAllocated || 0));
        const rate = money(Number(item.rate || 0));
        const itemTaxableValue = money(rate * qty);
        
        totalTaxableValue += itemTaxableValue;
        totalCgst += money(itemTaxableValue * ((taxDetail?.cgst ?? 9) / 100));
        totalSgst += money(itemTaxableValue * ((taxDetail?.sgst ?? 9) / 100));
        
        inventoryEntries += `
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${escapeXml(item.bcn)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <ACTUALQTY>${qty} ${unit}</ACTUALQTY>
              <BILLEDQTY>${qty} ${unit}</BILLEDQTY>
              <RATE>${fmt(rate)}/${unit}</RATE>
              <AMOUNT>${fmt(itemTaxableValue)}</AMOUNT>
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>${escapeXml(salesLedgerName)}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <AMOUNT>${fmt(itemTaxableValue)}</AMOUNT>
              </ACCOUNTINGALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>`;
    }

    const totalAmountBeforeRoundOff = money(totalTaxableValue + totalCgst + totalSgst);
    const roundedTotal = Math.round(totalAmountBeforeRoundOff);
    
    let partyDebitLedger = `<LEDGERENTRIES.LIST>
              <LEDGERNAME>${partyLedgerName}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <AMOUNT>-${fmt(roundedTotal)}</AMOUNT>
            </LEDGERENTRIES.LIST>`;
    
    let taxLedgers = '';

    if (totalCgst > 0) {
        taxLedgers += `
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>Output CGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${fmt(totalCgst)}</AMOUNT>
            </LEDGERENTRIES.LIST>`;
    }
  
    if (totalSgst > 0) {
        taxLedgers += `
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>Output SGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${fmt(totalSgst)}</AMOUNT>
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
