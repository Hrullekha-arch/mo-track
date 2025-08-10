
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function StockDetails() {
  return (
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
            <Button>Update Batch Tax</Button>
            <Button>Update Batch Rack</Button>
        </div>
      </CardContent>
    </Card>
  );
}
