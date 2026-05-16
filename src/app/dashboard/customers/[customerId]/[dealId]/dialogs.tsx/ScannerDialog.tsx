"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { searchStockById } from "@/app/dashboard/inventory/actions";
import { toast } from "@/hooks/use-toast";

type ScannerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStageItem: (stock: any, productId: string) => void;
};

const scannerContainerId = "product-scan-container";

export default function ScannerDialog({ open, onOpenChange, onStageItem }: ScannerDialogProps) {
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scanLockRef = useRef(false);
  const scanCompletedRef = useRef(false);
  const lastDecodedRef = useRef<{ text: string; ts: number } | null>(null);
  const stageLockRef = useRef(false);
  const stoppingRef = useRef(false);

  const [scanInput, setScanInput] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

  const extractProductIdFromValue = useCallback((value: string) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return null;

    const directMatch = trimmed.match(/product\/detail\/([^/?#]+)/i);
    if (directMatch?.[1]) return directMatch[1];

    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      const detailIndex = parts.findIndex((part) => part.toLowerCase() === "detail");
      if (detailIndex !== -1 && parts[detailIndex + 1]) {
        return parts[detailIndex + 1];
      }
      return parts[parts.length - 1] || null;
    } catch {
      const parts = trimmed.split("/").filter(Boolean);
      return parts[parts.length - 1] || null;
    }
  }, []);

  const playBeep = useCallback((variant: "success" | "error") => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = variant === "success" ? 880 : 220;
      gain.gain.value = 0.08;

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.stop(ctx.currentTime + 0.25);
      osc.onended = () => ctx.close();
    } catch (error) {
      console.error("Beep failed:", error);
    }
  }, []);

  const stopScanner = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    const inst = html5QrCodeRef.current;
    if (!inst) {
      stoppingRef.current = false;
      return;
    }

    try {
      if (inst.isScanning) {
        await inst.stop().catch(() => {});
      }

      const container = document.getElementById(scannerContainerId);
      if (container) {
        try {
          await inst.clear();
        } catch (err: any) {
          console.warn("html5-qrcode clear ignored:", err?.message || err);
        }
      }
    } finally {
      stoppingRef.current = false;
    }
  }, []);

  const handleScanPayload = useCallback(
    async (value: string): Promise<boolean> => {
      const productId = extractProductIdFromValue(value);
      if (!productId) {
        setScanError("Invalid QR code. Expected a product detail link.");
        playBeep("error");
        return false;
      }

      setScanError(null);
      setScanLoading(true);
      try {
        const results = await searchStockById(productId);
        if (!results || results.length === 0) {
          setScanError(`No stock found for product ID ${productId}.`);
          playBeep("error");
          return false;
        }
        scanCompletedRef.current = true;
        await stopScanner();
        
        // Stage the item
        if (stageLockRef.current) return true;
        stageLockRef.current = true;
        
        onStageItem(results[0], productId);
        
        setTimeout(() => {
          stageLockRef.current = false;
        }, 0);

        playBeep("success");
        toast({
          title: "Product staged",
          description: `${results[0]?.bcn || productId} added to staging.`,
        });
        onOpenChange(false);
        return true;
      } catch (error) {
        console.error("Failed to fetch stock by product ID:", error);
        setScanError("Failed to fetch stock for this product ID.");
        playBeep("error");
        return false;
      } finally {
        setScanLoading(false);
      }
    },
    [extractProductIdFromValue, playBeep, stopScanner, onStageItem, onOpenChange]
  );

  const handleScanSuccess = useCallback(
    (decodedText: string) => {
      const now = Date.now();
      const last = lastDecodedRef.current;

      if (last && last.text === decodedText && now - last.ts < 1500) {
        return;
      }
      lastDecodedRef.current = { text: decodedText, ts: now };

      if (scanLockRef.current || scanCompletedRef.current) return;

      scanLockRef.current = true;

      handleScanPayload(decodedText)
        .then((success) => {
          if (!success) {
            scanLockRef.current = false;
          }
        })
        .catch(() => {
          scanLockRef.current = false;
        });
    },
    [handleScanPayload]
  );

  const startScanner = useCallback(() => {
    if (!html5QrCodeRef.current || html5QrCodeRef.current.isScanning) {
      return;
    }

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      rememberLastUsedCamera: true,
    };

    html5QrCodeRef.current
      .start({ facingMode: "environment" }, config, handleScanSuccess, () => {})
      .catch((error) => {
        console.error("Scanner start error:", error);
        setHasCameraPermission(false);
        toast({
          variant: "destructive",
          title: "Scanner Error",
          description: "Could not start the camera.",
        });
      });
  }, [handleScanSuccess]);

  useEffect(() => {
    if (!open) {
      setScanError(null);
      setScanInput("");
      setHasCameraPermission(null);
      scanLockRef.current = false;
      scanCompletedRef.current = false;
      stopScanner();
      return;
    }
    
    scanLockRef.current = false;
    scanCompletedRef.current = false;

    if (hasCameraPermission === null) {
      Html5Qrcode.getCameras()
        .then((devices) => {
          setHasCameraPermission(!!devices?.length);
        })
        .catch(() => setHasCameraPermission(false));
    }

    let cancelled = false;
    let rafId: number | null = null;

    const ensureScanner = () => {
      if (cancelled) return;
      const container = document.getElementById(scannerContainerId);
      if (!container) {
        rafId = requestAnimationFrame(ensureScanner);
        return;
      }
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(scannerContainerId, {
          experimentalFeatures: { useOffscreenCanvas: true },
          verbose: false,
        });
      }
      if (hasCameraPermission) {
        startScanner();
      }
    };

    ensureScanner();

    return () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      stopScanner();
    };
  }, [open, hasCameraPermission, startScanner, stopScanner]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setScanInput("");
          setScanError(null);
          setScanLoading(false);
          lastDecodedRef.current = null;
          scanLockRef.current = false;
          scanCompletedRef.current = false;
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan Product QR</DialogTitle>
          <DialogDescription>
            Scan a QR code that links to{" "}
            <code>https://modesign.in/product/detail/{"{id}"}</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            id={scannerContainerId}
            className="aspect-square rounded-md border bg-muted flex items-center justify-center text-sm text-muted-foreground"
          >
            {hasCameraPermission === false && <span>Camera access is required to scan.</span>}
            {hasCameraPermission === null && <span>Initializing camera...</span>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-scan-input">Paste link or product ID</Label>
            <Input
              id="product-scan-input"
              value={scanInput}
              onChange={(event) => setScanInput(event.target.value)}
              placeholder="https://modesign.in/product/detail/30415"
            />
          </div>

          {scanError && <p className="text-sm text-destructive">{scanError}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            onClick={() => handleScanPayload(scanInput)}
            disabled={scanLoading || !scanInput.trim()}
          >
            {scanLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}