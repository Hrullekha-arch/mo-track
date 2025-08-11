"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CameraOff, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function BarcodeScannerPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const startScan = useCallback(async () => {
    try {
      setError(null);
      setResult(null);
      setScanning(true);
      setDialogOpen(true);

      const codeReader = new BrowserMultiFormatReader();
      const videoInputDevices = await codeReader.listVideoInputDevices();

      if (videoInputDevices.length === 0) {
        throw new Error("No camera found");
      }

      const selectedDeviceId = videoInputDevices[0].deviceId;

      codeReader.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current!,
        (result, err) => {
          if (result) {
            setResult(result.getText());
            setScanning(false);
            codeReader.reset();
            toast({
              title: "Barcode detected",
              description: result.getText(),
            });
          }
          if (err && !(err instanceof NotFoundException)) {
            console.error(err);
            setError("Error reading barcode");
            setScanning(false);
            codeReader.reset();
          }
        }
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Unexpected error");
      setScanning(false);
    }
  }, [toast]);

  useEffect(() => {
    return () => {
      setScanning(false);
    };
  }, []);

  return (
    <div className="p-6 flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Barcode Scanner</CardTitle>
          <CardDescription>Scan barcodes using your device camera</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button onClick={startScan} disabled={scanning}>
            {scanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning...
              </>
            ) : (
              "Start Scan"
            )}
          </Button>

          {result && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Scanned Successfully</AlertTitle>
              <AlertDescription>{result}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Camera Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <div className="flex flex-col gap-2 items-center">
            <video
              ref={videoRef}
              className={cn(
                "w-full h-auto rounded-lg",
                !scanning && "opacity-50"
              )}
              autoPlay
              muted
              playsInline
            />
            {!scanning && <CameraOff className="text-gray-500 w-6 h-6" />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
