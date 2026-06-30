"use client";

import { useState } from "react";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Props = {
  knownBarcodes?: string[];
};

export default function BarcodeScanner({ knownBarcodes = [] }: Props) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const handleScan = () => {
    if (!value.trim()) {
      setResult("Enter or scan a barcode value first.");
      return;
    }

    if (knownBarcodes.includes(value.trim())) {
      setResult(`Barcode ${value.trim()} matched. Workshop process can open this job.`);
      return;
    }

    setResult(`Barcode ${value.trim()} not found in the current mock workshop queue.`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanLine className="h-5 w-5" />
          Workshop Barcode Scanner
        </CardTitle>
        <CardDescription>
          Use camera integration later. For now, this input simulates the barcode scan flow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Scan or type barcode"
        />
        <Button onClick={handleScan}>Scan Barcode</Button>
        {result ? <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">{result}</div> : null}
      </CardContent>
    </Card>
  );
}
