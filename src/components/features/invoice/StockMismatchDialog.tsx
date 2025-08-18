
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface MismatchItem {
  itemName: string;
  crmQty: number;
  tallyQty: number;
}

interface StockMismatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  mismatchedItems: MismatchItem[];
}

export function StockMismatchDialog({ isOpen, onClose, onConfirm, mismatchedItems }: StockMismatchDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stock Quantity Mismatch</AlertDialogTitle>
          <AlertDialogDescription>
            The following items have different quantities in your CRM and Tally.
            Please verify the stock before proceeding.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-60 overflow-y-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Item Name</TableHead>
                        <TableHead className="text-right">CRM Qty</TableHead>
                        <TableHead className="text-right">Tally Qty</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {mismatchedItems.map(item => (
                        <TableRow key={item.itemName}>
                            <TableCell className="font-medium">{item.itemName}</TableCell>
                            <TableCell className="text-right">{item.crmQty.toFixed(2)}</TableCell>
                            <TableCell className="text-right text-destructive font-bold">{item.tallyQty.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Proceed Anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
