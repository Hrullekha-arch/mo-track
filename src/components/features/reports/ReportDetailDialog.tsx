
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import React from "react";

interface ReportDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  data: any[];
  columns: { accessorKey: string; header: string; cell?: (row: any) => React.ReactNode }[];
  footer?: React.ReactNode;
}

export function ReportDetailDialog({ isOpen, onClose, title, description, data, columns, footer }: ReportDetailDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-hidden">
          <ScrollArea className="h-full">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col.accessorKey}>{col.header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length > 0 ? (
                  data.map((row, index) => (
                    <TableRow key={row.id || index}>
                      {columns.map((col) => (
                        <TableCell key={col.accessorKey}>
                          {col.cell ? col.cell(row) : row[col.accessorKey]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No data available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
        {footer && <DialogFooter className="pt-4 border-t">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
