
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, Loader2, AlertTriangle, CameraOff, ScanLine } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { completePmsProcess } from "./actions";
import { useRouter } from 'next/navigation';
import { Order } from "@/lib/types";

type ScanResult = {
  status: 'success' | 'warning' | 'error';
  message: string;
  order?: Order | null;
};

const ScanResultDialog = ({ result, onClose }: { result: ScanResult, onClose: () => void }) => {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
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
                    {result.order && (
                        <div className="text-xs mt-2 p-2 border rounded-md bg-muted">
                            <p><strong>Order:</strong> {result.order.id}</p>
                            <p><strong>Customer:</strong> {result.order.customerName}</p>
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

export default function UniversalScannerPage() {
    const { toast } = useToast();
    const router = useRouter();
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const videoRef = useRef<HTMLDivElement>(null);

    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [devices, setDevices] = useState<{ id: string, label: string }[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);


    useEffect(() => {
        Html5Qrcode.getCameras().then(devices => {
            if (devices && devices.length) {
                setDevices(devices);
                // Prefer the back camera by default
                const backCamera = devices.find(d => d.label.toLowerCase().includes('back'));
                setSelectedDeviceId(backCamera?.id || devices[0].id);
                setHasCameraPermission(true);
            } else {
                setHasCameraPermission(false);
            }
        }).catch(err => {
            console.error(err);
            setHasCameraPermission(false);
            toast({ variant: 'destructive', title: "Camera Error", description: "Could not get camera permissions." });
        });
    }, [toast]);
    
    const startScanner = useCallback(() => {
        if (videoRef.current && selectedDeviceId) {
            scannerRef.current = new Html5Qrcode(videoRef.current.id);
            setIsScanning(true);
            scannerRef.current.start(
                selectedDeviceId,
                { fps: 10, qrbox: { width: 250, height: 250 } },
                async (decodedText, decodedResult) => {
                    if (isProcessing) return;
                    setIsProcessing(true);
                    
                    try {
                        const result = await completePmsProcess({ orderId: decodedText });
                        setScanResult(result);
                    } catch (e) {
                         setScanResult({ success: false, message: "An error occurred while processing."});
                    } finally {
                        stopScanner();
                    }
                },
                (errorMessage) => {
                    // console.warn(`QR Code no longer in front of camera: ${errorMessage}`);
                }
            ).catch(err => {
                console.error("Scanner Start Error:", err);
                toast({ variant: 'destructive', title: "Scanner Error", description: err.message });
                setIsScanning(false);
            });
        }
    }, [selectedDeviceId, isProcessing, toast]);

    const stopScanner = useCallback(() => {
        if (scannerRef.current && scannerRef.current.isScanning) {
            scannerRef.current.stop().then(() => {
                setIsScanning(false);
            }).catch(err => {
                console.error("Scanner Stop Error:", err);
            });
        }
    }, []);

    const closeResultDialog = () => {
        setScanResult(null);
        setIsProcessing(false);
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
                        {!isScanning && (
                            <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center text-center p-4">
                                {hasCameraPermission === false ? (
                                    <Alert variant="destructive">
                                        <CameraOff className="h-4 w-4" />
                                        <AlertTitle>Camera Access Required</AlertTitle>
                                        <AlertDescription>
                                            Please allow camera access to use this feature.
                                        </AlertDescription>
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

                    {!isScanning ? (
                        <Button onClick={startScanner} disabled={hasCameraPermission !== true}>
                            Start Scanning
                        </Button>
                    ) : (
                        <Button onClick={stopScanner} variant="destructive">
                            Stop Scanning
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
