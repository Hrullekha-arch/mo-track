
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState } from "react";
import { UpdateBatchTaxDialog } from "./UpdateBatchTaxDialog";
import { UpdateBatchRackDialog } from "./UpdateBatchRackDialog";

export function StockDetails() {
  const [isTaxDialogOpen, setIsTaxDialogOpen] = useState(false);
  const [isRackDialogOpen, setIsRackDialogOpen] = useState(false);

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Stock Details</CardTitle>
        <CardDescription>
          This is the new Stock Details tab. You can add your new features here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>Stock details content will go here.</p>
        <div className="flex gap-4">
            <Button onClick={() => setIsTaxDialogOpen(true)}>Update Batch Tax</Button>
            <Button onClick={() => setIsRackDialogOpen(true)}>Update Batch Rack</Button>
        </div>
      </CardContent>
    </Card>
    <UpdateBatchTaxDialog isOpen={isTaxDialogOpen} onClose={() => setIsTaxDialogOpen(false)} />
    <UpdateBatchRackDialog isOpen={isRackDialogOpen} onClose={() => setIsRackDialogOpen(false)} />
    </>
  );
}
