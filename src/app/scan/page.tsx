
"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, Loader2, AlertTriangle, CameraOff, ScanLine, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Html5Qrcode } from 'html5-qrcode';
import { completePmsProcess } from "./actions";
import { useSearchParams } from 'next/navigation';
import { Order, Stock } from "@/lib/types";
import { getStockById } from "../dashboard/inventory/actions";
import { Separator } from "@/components/ui/separator";

type ScanAction = 'pmsComplete' | 'stockDetail' | 'verifyCut';

type ScanResult = {
  status: 'success' | 'warning' | 'error';
  message: string;
  data?: any;
};

const StockDetailDisplay = ({ stock }: { stock: Stock }) => (
    <div className="space-y-3">
        <h3 className="font-bold">{stock.bcn}</h3>
        <p className="text-sm text-muted-foreground">{stock.itemName}</p>
        <Separator/>
        <div className="grid grid-cols-2 gap-2 text-sm">
            <p><strong className="text-muted-foreground">Quantity:</strong> {stock.quantity}</p>
            <p><strong className="text-muted-foreground">MRP:</strong> ₹{stock.mrp}</p>
            <p><strong className="text-muted-foreground">Rack:</strong> {stock.rack || 'N/A'}</p>
            <p><strong className="text-muted-foreground">Vendor:</strong> {stock.vendorName || 'N/A'}</p>
        </div>
    </div>
);

const ScanResultDialog = ({ result, onClose }: { result: ScanResult, onClose: () => void }) => {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        {result.status === 'success' && <CheckCircle className="h-6 w-6 text-green-500" />}
                        {result.status === 'warning' && <AlertTriangle className="h-6 w-6 text-yellow-500" />}
                        {result.status === 'error' && <AlertTriangle className="h-6 w-6 text-red-500" />}
                        Scan Result
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p>{result.message}</p>
                    {result.data?.stock && <StockDetailDisplay stock={result.data.stock} />}
                    {result.data?.order && (
                        <div className="text-xs mt-2 p-2 border rounded-md bg-muted">
                            <p><strong>Order:</strong> {result.data.order.id}</p>
                            <p><strong>Customer:</strong> {result.data.order.customerName}</p>
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    <Button onClick={onClose} className="w-full">Close</Button>
                </CardFooter>
            </Card>
        </div>
    )
}

function UniversalScanner() {
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const videoRef = useRef<HTMLDivElement>(null);
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const action = (searchParams.get('action') || 'pmsComplete') as ScanAction;
    const taskId = searchParams.get('taskId');
    const targetBcn = searchParams.get('bcn');

    const handleScanSuccess = useCallback(async (decodedText: string) => {
        if (isProcessing) return;
        setIsProcessing(true);
        html5QrCodeRef.current?.stop();

        try {
            let result: ScanResult;
            switch (action) {
                case 'pmsComplete':
                    const pmsResult = await completePmsProcess({ orderId: decodedText });
                    result = { ...pmsResult, data: { order: pmsResult.order } };
                    break;
                case 'stockDetail':
                    const stockId = decodedText.replace(/\//g, '-');
                    const stock = await getStockById(stockId);
                    if (stock) {
                        result = { success: true, message: "Stock found.", data: { stock } };
                    } else {
                        result = { success: false, message: "Stock not found." };
                    }
                    break;
                case 'verifyCut':
                    // This logic would need to be moved to a server action.
                    // For now, this is a placeholder.
                    if (decodedText === targetBcn) {
                         result = { success: true, message: `Verified cut for ${targetBcn} on task ${taskId}.` };
                    } else {
                        result = { success: false, message: `Incorrect BCN. Expected ${targetBcn}, scanned ${decodedText}.` };
                    }
                    break;
                default:
                    result = { success: false, message: "Unknown scan action." };
            }
            setScanResult(result);
        } catch (e: any) {
            setScanResult({ success: false, message: `An error occurred: ${e.message}` });
        }
    }, [action, isProcessing, targetBcn, taskId]);


    const startScanner = useCallback(() => {
        if (!videoRef.current || !html5QrCodeRef.current) return;

        html5QrCodeRef.current.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            handleScanSuccess,
            (errorMessage) => { /* ignore errors */ }
        ).catch((err) => {
            toast({ variant: 'destructive', title: "Scanner Error", description: err.message });
        });
    }, [handleScanSuccess, toast]);

    useEffect(() => {
        if (!videoRef.current) return;
        html5QrCodeRef.current = new Html5Qrcode(videoRef.current.id);

        Html5Qrcode.getCameras()
            .then(() => setHasPermission(true))
            .catch(() => setHasPermission(false));

        return () => {
            html5QrCodeRef.current?.stop().catch(err => console.error("Cleanup failed", err));
        };
    }, []);

    const closeResultDialog = () => {
        setScanResult(null);
        setIsProcessing(false);
        startScanner();
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            {scanResult && <ScanResultDialog result={scanResult} onClose={closeResultDialog} />}
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Universal Scanner</CardTitle>
                    <CardDescription>Point the camera at a barcode to process.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <div id="scanner-container" ref={videoRef} className="aspect-square bg-muted rounded-md overflow-hidden relative flex items-center justify-center">
                       {!isProcessing && (
                            <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center text-center p-4">
                                {hasPermission === false ? (
                                    <Alert variant="destructive">
                                        <CameraOff className="h-4 w-4" />
                                        <AlertTitle>Camera Access Required</AlertTitle>
                                    </Alert>
                                ) : (
                                    <>
                                        <ScanLine className="h-12 w-12 text-muted-foreground mb-4" />
                                        <p className="font-semibold">Ready to Scan</p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                     <Button onClick={startScanner} disabled={hasPermission !== true || isProcessing}>
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanLine className="mr-2 h-4 w-4"/>}
                        Start Scanning
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

export default function UniversalScannerPage() {
    return (
        <Suspense fallback={<p>Loading scanner...</p>}>
            <UniversalScanner />
        </Suspense>
    )
}
