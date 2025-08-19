
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
import { AlertTriangle } from "lucide-react";

interface MismatchItem {
  itemName: string;
  crmQty: number;
  tallyQty: number;
  requiredQty?: number;
  errorType: 'mismatch' | 'insufficient';
}

interface StockMismatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  mismatchedItems: MismatchItem[];
}

export function StockMismatchDialog({ isOpen, onClose, onConfirm, mismatchedItems }: StockMismatchDialogProps) {
  const hasMismatch = mismatchedItems.some(i => i.errorType === 'mismatch');
  const hasInsufficient = mismatchedItems.some(i => i.errorType === 'insufficient');

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-destructive"/>
            Stock Verification Failed
          </AlertDialogTitle>
          <AlertDialogDescription>
            The following issues were found. Please verify the stock in both your CRM and Tally before proceeding.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-60 overflow-y-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Item Name</TableHead>
                        <TableHead className="text-right">CRM Qty</TableHead>
                        <TableHead className="text-right">Tally Qty</TableHead>
                        {hasInsufficient && <TableHead className="text-right">Required</TableHead>}
                        <TableHead>Issue</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {mismatchedItems.map(item => (
                        <TableRow key={item.itemName} className={item.errorType === 'insufficient' ? 'bg-destructive/10' : ''}>
                            <TableCell className="font-medium">{item.itemName}</TableCell>
                            <TableCell className="text-right">{item.crmQty.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-bold">{item.tallyQty.toFixed(2)}</TableCell>
                            {hasInsufficient && <TableCell className="text-right">{item.requiredQty?.toFixed(2) ?? 'N/A'}</TableCell>}
                            <TableCell>
                               {item.errorType === 'mismatch' ? 'Mismatch' : 'Insufficient'}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          {hasInsufficient ? (
              <AlertDialogAction disabled>Cannot Proceed</AlertDialogAction>
          ) : (
             <AlertDialogAction onClick={onConfirm}>Proceed Anyway</AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
