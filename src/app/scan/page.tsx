
"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, Loader2, AlertTriangle, CameraOff, ScanLine, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { completePmsProcess } from "./actions";
import { useSearchParams, useRouter } from 'next/navigation';
import { Order, Stock } from "@/lib/types";
import { getStockById } from "../dashboard/inventory/actions";
import { Separator } from "@/components/ui/separator";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

type ScanAction = 'pmsComplete' | 'stockDetail' | 'verifyCut' | 'verifyInbound';

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
    const router = useRouter();
    const { toast } = useToast();
    const scannerContainerId = "scanner-container";
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
        if (html5QrCodeRef.current?.getState() === Html5QrcodeScannerState.SCANNING) {
            try {
                await html5QrCodeRef.current.stop();
            } catch (err) {
                console.warn("Scanner could not be stopped, it might have been already stopped.", err);
            }
        }

        try {
            let result: ScanResult;
            switch (action) {
                case 'pmsComplete':
                    const pmsResult = await completePmsProcess({ orderId: decodedText });
                    result = { status: pmsResult.success ? 'success' : 'error', message: pmsResult.message, data: { order: pmsResult.order } };
                    break;
                case 'stockDetail':
                    const stockId = decodedText.replace(/\//g, '-');
                    const stock = await getStockById(stockId);
                    if (stock) {
                        result = { status: 'success', message: "Stock found.", data: { stock } };
                    } else {
                        result = { status: 'error', message: "Stock not found." };
                    }
                    break;
                case 'verifyCut':
                    if (decodedText === targetBcn) {
                         const taskRef = doc(db, 'Cutting', taskId!);
                         const taskDoc = await getDoc(taskRef);
                         if (taskDoc.exists()) {
                            const taskData = taskDoc.data();
                            const updatedItems = taskData.items.map((item: any) => 
                                item.bcn === targetBcn ? { ...item, status: 'cut' } : item
                            );
                             const allCut = updatedItems.every((item:any) => item.status === 'cut');
                             await updateDoc(taskRef, { items: updatedItems, status: allCut ? 'Completed' : 'In Progress' });
                             result = { status: 'success', message: `Verified cut for ${targetBcn} on task ${taskId}.` };
                         } else {
                            result = { status: 'error', message: "Task not found." };
                         }
                    } else {
                        result = { status: 'error', message: `Incorrect BCN. Expected ${targetBcn}, scanned ${decodedText}.` };
                    }
                    break;
                default:
                    result = { status: 'error', message: "Unknown scan action." };
            }
            setScanResult(result);
        } catch (e: any) {
            setScanResult({ status: 'error', message: `An error occurred: ${e.message}` });
        }
    }, [action, isProcessing, targetBcn, taskId]);

    const startScanner = useCallback(() => {
        if (!html5QrCodeRef.current) return;
        
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        
        html5QrCodeRef.current.start(
            { facingMode: "environment" },
            config,
            handleScanSuccess,
            (errorMessage) => { /* ignore errors */ }
        ).catch((err) => {
            console.error("Scanner start error:", err);
            setHasPermission(false);
            toast({ variant: 'destructive', title: "Scanner Error", description: "Could not start the camera. Please grant permissions." });
        });
    }, [handleScanSuccess, toast]);

    useEffect(() => {
        if (!html5QrCodeRef.current) {
            html5QrCodeRef.current = new Html5Qrcode(scannerContainerId);
        }
        
        const qrCodeScanner = html5QrCodeRef.current;

        if (hasPermission === null) {
            Html5Qrcode.getCameras()
                .then(devices => {
                    if (devices && devices.length) {
                        setHasPermission(true);
                    } else {
                        setHasPermission(false);
                    }
                })
                .catch(() => {
                    setHasPermission(false);
                });
        }
    
        if (hasPermission && qrCodeScanner.getState() !== Html5QrcodeScannerState.SCANNING) {
            startScanner();
        }

        return () => {
            if (qrCodeScanner?.isScanning) {
                qrCodeScanner.stop().catch(err => console.error("Error stopping scanner on unmount:", err));
            }
        };
    }, [hasPermission, startScanner]);

    const closeResultDialog = () => {
        setScanResult(null);
        setIsProcessing(false);
        if (action === 'verifyCut') {
            router.back();
        } else if (hasPermission) {
            startScanner();
        }
    };
    
    let pageTitle = "Universal Scanner";
    let pageDescription = "Point the camera at a barcode to process.";
    switch (action) {
        case 'pmsComplete':
            pageTitle = "PMS Completion Scanner";
            pageDescription = "Scan the order barcode to mark the entire PMS process as complete."
            break;
        case 'stockDetail':
            pageTitle = "Stock Detail Scanner";
            pageDescription = "Scan a stock item barcode to view its details.";
            break;
        case 'verifyCut':
            pageTitle = "Verify Cut Scanner";
            pageDescription = `Scan the barcode for item BCN: ${targetBcn} to verify it has been cut.`;
            break;
    }


    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            {scanResult && <ScanResultDialog result={scanResult} onClose={closeResultDialog} />}
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>{pageTitle}</CardTitle>
                    <CardDescription>{pageDescription}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <div id={scannerContainerId} className="aspect-square bg-muted rounded-md overflow-hidden relative flex items-center justify-center text-sm">
                       {hasPermission === false && (
                         <Alert variant="destructive">
                            <CameraOff className="h-4 w-4" />
                            <AlertTitle>Camera Access Required</AlertTitle>
                            <AlertDescription>Please grant camera permissions to use the scanner.</AlertDescription>
                        </Alert>
                       )}
                       {hasPermission === null && (
                           <div className="flex flex-col items-center gap-2 text-muted-foreground">
                               <Loader2 className="h-6 w-6 animate-spin" />
                               <p>Initializing Camera...</p>
                           </div>
                       )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function UniversalScannerPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
            <UniversalScanner />
        </Suspense>
    )
}
