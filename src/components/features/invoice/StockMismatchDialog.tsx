
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
import { AlertTriangle, TriangleAlert } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface MismatchItem {
  itemName: string;
  crmQty: number;
  tallyQty: number;
  requiredQty?: number;
  errorType: 'mismatch' | 'insufficient';
  difference: number;
}

interface StockMismatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mismatchedItems: MismatchItem[];
}

export function StockMismatchDialog({ isOpen, onClose, mismatchedItems }: StockMismatchDialogProps) {
  
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader className="text-center">
            <AlertDialogTitle className="text-2xl font-bold text-destructive flex items-center justify-center gap-2">
                <TriangleAlert className="h-7 w-7"/>
                Stock MisMatch
            </AlertDialogTitle>
            <Separator className="bg-destructive h-[2px]" />
        </AlertDialogHeader>
        <div className="max-h-80 overflow-y-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Item BCN</TableHead>
                        <TableHead className="text-right">CRM Stock</TableHead>
                        <TableHead className="text-right">Tally Stock</TableHead>
                        <TableHead className="text-right">Difference</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {mismatchedItems.map((item, index) => (
                        <TableRow key={`${item.itemName}-${index}`}>
                            <TableCell className="font-medium">{item.itemName}</TableCell>
                            <TableCell className="text-right font-semibold">{item.crmQty.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold">{item.tallyQty.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-bold text-destructive">{item.difference.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
