'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EnrichedProduct, formatCurrency } from './quotation-builder-utils';

type HiddenPdfProps = {
  pdfRef: React.RefObject<HTMLDivElement | null>;
  dealCode: string;
  customerName: string;
  customerPhone: string;
  groupedRooms: Record<string, EnrichedProduct[]>;
  deriveRowAmounts: (item: EnrichedProduct) => {
    qty: number;
    gross: number;
    discountAmount: number;
    net: number;
    discountPercent: number;
    taxPercent: number;
    gstAmount: number;
    totalWithTax: number;
  };
  discountAmount: number;
  baseAmount: number;
  gstTotal: number;
  grandTotal: number;
};

export function QuotationBuilderHiddenPdf({
  pdfRef,
  dealCode,
  customerName,
  customerPhone,
  groupedRooms,
  deriveRowAmounts,
  discountAmount,
  baseAmount,
  gstTotal,
  grandTotal,
}: HiddenPdfProps) {
  return (
    <div className="fixed -left-[9999px] top-0 bg-white text-black" ref={pdfRef}>
      <div className="w-[794px] min-h-[1123px] p-6 text-xs font-sans">
        <div className="flex justify-between items-start border-b pb-3">
          <div className="space-y-1">
            <div className="text-2xl font-bold">Quotation</div>
            <div className="font-bold">MO DESIGNS PRIVATE LIMITED</div>
            <div>A-6, Sushant Lok-1, M G Road, Gurgaon-122002,B-50, Sushant Lok-2, Sec- 56,</div>
            <div>Gurgaon - 122011 GURGAON. (HARYANA) INDIA</div>
            <div>GSTIN : 06AACCM5012B1ZY , PAN No : AACCM5012B</div>
            <div>Email id : info@mofurnishings.com , Contact No : 0124-4777888</div>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <img src="/logo.png" alt="MO" className="h-14 w-auto" />
            <div className="text-[11px] space-y-1">
              <div>Quotation #{dealCode || '-'}</div>
              <div>Date: {new Date().toLocaleDateString('en-GB')}</div>
              <div>Salesman : -</div>
              <div>Created By : -</div>
            </div>
          </div>
        </div>

        <div className="border-b py-3 text-[11px]">
          <div className="font-semibold mb-1">To,</div>
          <div className="uppercase font-bold">{customerName || 'Customer Name'}</div>
          <div>{customerPhone ? `Contact No:${customerPhone}` : ''}</div>
          <div>GSTIN:</div>
        </div>

        <div className="py-3 text-[11px]">
          <p>Dear Sir/Madam,</p>
          <p className="mt-1">
            Thank you for considering us as your furnishing partner. We look forward to your business and promise you our best services.
            We are pleased to submit our Quotation, which is as follows:-
          </p>
        </div>

        <table className="w-full text-[10px] border-collapse" cellPadding={4}>
          <thead>
            <tr className="border bg-gray-100">
              <th className="border w-6">#</th>
              <th className="border">HSN</th>
              <th className="border">Particulars</th>
              <th className="border w-10">Qty</th>
              <th className="border w-10">UOM</th>
              <th className="border w-14">Rate</th>
              <th className="border w-16">Amount</th>
              <th className="border w-14">Disc.</th>
              <th className="border w-12">Tax (%)</th>
              <th className="border w-16">Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(groupedRooms).length === 0 && (
              <tr>
                <td className="border text-center" colSpan={10}>
                  No items
                </td>
              </tr>
            )}
            {Object.entries(groupedRooms).map(([roomName, roomItems], roomIndex) => {
              let serial = 1;
              return (
                <React.Fragment key={roomName}>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="border text-center">{roomIndex + 1}</td>
                    <td className="border text-left" colSpan={9}>
                      {roomName.toUpperCase()}
                    </td>
                  </tr>
                  {roomItems.map((item) => {
                    const { qty, gross, discountAmount: rowDiscount, discountPercent, taxPercent, totalWithTax } = deriveRowAmounts(item);
                    return (
                      <tr key={item.id}>
                        <td className="border text-center">{serial++}</td>
                        <td className="border text-center">{item.bcn || '-'}</td>
                        <td className="border">{item.itemName || '-'}</td>
                        <td className="border text-right">{qty.toFixed(2)}</td>
                        <td className="border text-center">{item.isBlind ? 'PCS' : 'MTRS'}</td>
                        <td className="border text-right">{formatCurrency(item.mrp)}</td>
                        <td className="border text-right">{formatCurrency(gross)}</td>
                        <td className="border text-right">
                          {discountPercent > 0 ? `${formatCurrency(rowDiscount)} @${discountPercent}%` : '-'}
                        </td>
                        <td className="border text-center">{taxPercent.toFixed(2)}%</td>
                        <td className="border text-right">{formatCurrency(totalWithTax)}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        <div className="mt-6 grid grid-cols-2 gap-4 text-[11px]">
          <div className="space-y-1">
            <div className="font-bold">MO DESIGNS PRIVATE LIMITED</div>
            <div>BANK DETAILS - HDFC BANK LTD,SECTOR-56, HUDA DISTRICT</div>
            <div>CENTRE, GURGAON-122001 HARYANA</div>
            <div>Acc.No. - 50200094305041,IFSC - HDFC0003871</div>
          </div>
          <div>
            <table className="w-full text-[10px] border-collapse" cellPadding={4}>
              <tbody>
                <tr>
                  <td className="border">Total Discount</td>
                  <td className="border text-right">{formatCurrency(discountAmount)}</td>
                </tr>
                <tr>
                  <td className="border">Taxable Amount (excl. GST)</td>
                  <td className="border text-right">{formatCurrency(baseAmount)}</td>
                </tr>
                <tr>
                  <td className="border">GST (5% Fabric, 18% Hardware/Blind)</td>
                  <td className="border text-right">{formatCurrency(gstTotal)}</td>
                </tr>
                <tr className="font-semibold">
                  <td className="border">Grand Total (Incl. GST)</td>
                  <td className="border text-right">{formatCurrency(grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

type EditDialogProps = {
  editOpen: boolean;
  editingItem: EnrichedProduct | null;
  editForm: any;
  saving: boolean;
  setEditOpen: (open: boolean) => void;
  setEditingItem: (item: EnrichedProduct | null) => void;
  handleEditChange: (key: string, value: any) => void;
  handleSaveEdit: () => void;
};

export function QuotationBuilderEditDialog({
  editOpen,
  editingItem,
  editForm,
  saving,
  setEditOpen,
  setEditingItem,
  handleEditChange,
  handleSaveEdit,
}: EditDialogProps) {
  return (
    <Dialog
      open={editOpen}
      onOpenChange={(open) => {
        setEditOpen(open);
        if (!open) setEditingItem(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {editingItem?.isBlind ? 'Blind' : 'Item'}</DialogTitle>
        </DialogHeader>

        {editingItem && (
          <div className="grid grid-cols-2 gap-3">
            {editingItem.isBlind ? (
              <>
                <div className="col-span-2">
                  <Label className="text-sm">Blind Type</Label>
                  <Input value={editForm.blindType || ''} onChange={(e) => handleEditChange('blindType', e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">Shade No</Label>
                  <Input value={editForm.shadeNo || ''} onChange={(e) => handleEditChange('shadeNo', e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">Control</Label>
                  <Input value={editForm.control || ''} onChange={(e) => handleEditChange('control', e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">Type</Label>
                  <Input value={editForm.type || ''} onChange={(e) => handleEditChange('type', e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">Width</Label>
                  <Input value={editForm.width || ''} onChange={(e) => handleEditChange('width', e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">Height</Label>
                  <Input value={editForm.height || ''} onChange={(e) => handleEditChange('height', e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">Qty</Label>
                  <Input type="number" defaultValue={editForm.noOfBlind || editForm.qty || ''} onChange={(e) => handleEditChange('noOfBlind', e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">Area</Label>
                  <Input value={editForm.area || ''} onChange={(e) => handleEditChange('area', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label className="text-sm">Remarks</Label>
                  <Input value={editForm.remarks || ''} onChange={(e) => handleEditChange('remarks', e.target.value)} />
                </div>
              </>
            ) : (
              <>
                <div className="col-span-2">
                  <Label className="text-sm">Item Name</Label>
                  <Input value={editForm.itemName || ''} onChange={(e) => handleEditChange('itemName', e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">BCN</Label>
                  <Input value={editForm.collectionBrand || ''} onChange={(e) => handleEditChange('collectionBrand', e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">No. of Panel / Seat</Label>
                  <Input value={editForm.noOfPannel || ''} onChange={(e) => handleEditChange('noOfPannel', e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">Width</Label>
                  <Input value={editForm.width || ''} onChange={(e) => handleEditChange('width', e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">Height</Label>
                  <Input value={editForm.height || ''} onChange={(e) => handleEditChange('height', e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">Qty (Mtr)</Label>
                  <Input type="number" defaultValue={editForm.qty || ''} onChange={(e) => handleEditChange('qty', e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">Rate</Label>
                  <Input type="number" defaultValue={editForm.mrp || ''} onChange={(e) => handleEditChange('mrp', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label className="text-sm">Remark</Label>
                  <Input value={editForm.remark || ''} onChange={(e) => handleEditChange('remark', e.target.value)} />
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => { setEditOpen(false); setEditingItem(null); }}>
            Cancel
          </Button>
          <Button onClick={handleSaveEdit} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
