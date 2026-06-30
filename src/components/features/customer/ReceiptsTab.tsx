
"use client";

import { useState, useEffect, useCallback } from "react";
import { Receipt } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getReceiptsForDeal } from "@/app/dashboard/customers/[customerId]/[dealId]/actions";
import { ReceiptForm } from "./ReceiptForm";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export function ReceiptsTab({
  customerId,
  dealId,
  receipts: initialReceipts = [],
  onRefresh,
}: {
  customerId: string;
  dealId: string;
  receipts?: Receipt[];
  onRefresh?: () => void;
}) {
  const [receipts, setReceipts] = useState<Receipt[]>(initialReceipts);
  const [loading, setLoading] = useState(true);

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    const data = await getReceiptsForDeal(customerId, dealId);
    setReceipts(data);
    setLoading(false);
  }, [customerId, dealId]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  return (
    <div className="space-y-6">
      <ReceiptForm
        customerId={customerId}
        dealId={dealId}
        onReceiptAdded={fetchReceipts}
      />

      <Card>
        <CardHeader>
          <CardTitle>Receipt History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Reference No.</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.length > 0 ? (
                  receipts.map((receipt) => (
                    <TableRow key={receipt.id}>
                      <TableCell>
                        {format(new Date(receipt.date), "PPP")}
                      </TableCell>
                      <TableCell>{receipt.mode}</TableCell>
                      <TableCell>{receipt.referenceNo || "-"}</TableCell>
                      <TableCell>{receipt.remarks || "-"}</TableCell>
                      <TableCell className="text-right font-semibold">
                        ₹{receipt.amount.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No receipts found for this deal.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
