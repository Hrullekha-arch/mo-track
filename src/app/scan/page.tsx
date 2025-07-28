
"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Camera, CheckCircle, Loader2, ScanLine, Home, User, ShoppingBag, XCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { completePmsProcess } from './actions';
import { BrowserMultiFormatReader, NotFoundException, DecodeHintType, BarcodeFormat } from '@zxing/library';
import { Order } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type ScanStatus = 'success' | 'warning' | 'error';

interface ScanResult {
    status: ScanStatus;
    message: string;
}

const ScanResultPopup = ({ result, isOpen, onOpenChange }: { result: ScanResult | null, isOpen: boolean, onOpenChange: (open: boolean) => void }) => {
    if (!result) return null;

    const { status, message } = result;
    const Icon = status === 'success' ? CheckCircle : status === 'warning' ? AlertTriangle : XCircle;
    const iconColor = status === 'success' ? 'text-green-500' : status === 'warning' ? 'text-orange-400' : 'text-red-500';

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md p-0" hideCloseButton>
                <div className={cn(
                    "flex flex-col items-center justify-center p-8 rounded-lg text-center space-y-4",
                )}>
                    <Icon className={cn("h-20 w-20", iconColor)} />
                    <p className="text-xl font-bold">{message}</p>
                </div>
            </DialogContent>
        </Dialog>
    );
};


function PmsScanner() {
    const { toast } = useToast();
    const videoRef = useRef<HTMLVideoElement>(null);
    const codeReader = useRef(new BrowserMultiFormatReader(new Map([
        [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]]
    ])));
    
    const [manualId, setManualId] = useState('');
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const isScanningRef = useRef(false);

    const processScan = async (id: string) => {
        if (!id || loading || isScanningRef.current) return;

        isScanningRef.current = true;
        setLoading(true);
        setOrder(null);
        
        try {
            const result = await completePmsProcess({ orderId: id });
            
            let status: ScanStatus = 'error';
            if (result.success) {
                status = result.message.includes('already complete') ? 'warning' : 'success';
            }
            
            setScanResult({ status, message: result.message });
            setIsPopupOpen(true);
            setTimeout(() => setIsPopupOpen(false), 1500);

            if (result.order) {
                 setOrder(result.order as Order);
            } else {
                setOrder(null);
            }
        } catch (error) {
             setScanResult({ status: 'error', message: 'An unexpected error occurred.' });
             setIsPopupOpen(true);
             setTimeout(() => setIsPopupOpen(false), 1500);
             console.error("Error during scan process:", error);
        } finally {
            setLoading(false);
            setTimeout(() => {
                isScanningRef.current = false;
            }, 2000); // 2-second cooldown
        }
    };
    
    useEffect(() => {
        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                    setHasCameraPermission(true);

                    codeReader.current.decodeFromVideoDevice(
                        undefined,
                        videoRef.current,
                        (result, err) => {
                            if (result) {
                                const scannedText = result.getText();
                                if (!isScanningRef.current) {
                                    setManualId(scannedText);
                                    processScan(scannedText);
                                }
                            }
                            if (err && !(err instanceof NotFoundException)) {
                                console.error("Decode error:", err);
                            }
                        }
                    );
                }
            } catch (error) {
                console.error("Error accessing camera:", error);
                setHasCameraPermission(false);
                toast({
                    variant: "destructive",
                    title: "Camera Access Denied",
                    description: "Please enable camera permissions in your browser settings.",
                    duration: 5000,
                });
            }
        };

        startCamera();
        
        return () => {
             if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
            codeReader.current.reset();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        processScan(manualId);
    };

    const getItemsForOrder = (order: Order | null) => {
        if (!order) return [];
        const fabricItems = (order.fabricDetails || [])
            .filter(f => f.fabricName)
            .map(f => ({ name: f.fabricName, quantity: f.quantity, unit: 'Mtr' }));
        const furnitureItems = (order.furnitureDetails || [])
            .filter(f => f.furnitureName)
            .map(f => ({ name: f.furnitureName, quantity: f.quantity, unit: 'Qty' }));
        return [...fabricItems, ...furnitureItems];
    }
    const items = getItemsForOrder(order);

    return (
        <>
        <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-4xl">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                    <Button asChild variant="outline" size="icon">
                        <Link href="/"><Home /></Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">PMS Barcode Scanner</h1>
                        <p className="text-muted-foreground">Scan a barcode to complete the production process.</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Scanner</CardTitle>
                        <CardDescription>Point the camera at a barcode to automatically scan, or enter manually.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="aspect-video bg-muted rounded-md overflow-hidden relative flex items-center justify-center mb-4">
                            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                            {hasCameraPermission === null && (
                                 <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center text-center p-4">
                                    <Loader2 className="h-12 w-12 text-muted-foreground mb-4 animate-spin"/>
                                    <p className="font-semibold">Initializing Camera...</p>
                                 </div>
                            )}
                            {hasCameraPermission === false && (
                                 <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center text-center p-4">
                                    <Camera className="h-12 w-12 text-muted-foreground mb-4"/>
                                    <p className="font-semibold">Camera Access Required</p>
                                    <p className="text-sm text-muted-foreground">Please allow camera access in your browser.</p>
                                 </div>
                            )}
                             <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-4/5 h-2/5 border-4 border-red-500/70 rounded-lg bg-black/20" />
                             </div>
                        </div>
                         <form onSubmit={handleManualSubmit} className="space-y-2">
                             <p className="text-sm text-muted-foreground">Or enter ID manually:</p>
                             <div className="flex gap-2">
                                <Input 
                                    placeholder="Enter CRM Order No..."
                                    value={manualId}
                                    onChange={(e) => setManualId(e.target.value)}
                                />
                                <Button type="submit" disabled={loading || !manualId}>
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                                    Submit
                                </Button>
                             </div>
                        </form>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Scanned Order Details</CardTitle>
                         <CardDescription>
                           {order ? `Details for order ${order.crmOrderNo}` : 'Scan an order to see details here.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                       {loading && !order && <Skeleton className="h-40 w-full" />}
                       {!loading && order && (
                           <div className="space-y-4">
                               <div className="space-y-2 text-sm">
                                   <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground"/>Customer: <span className="font-medium">{order.customerName}</span></div>
                                   <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground"/>Salesman: <span className="font-medium">{order.salesPerson}</span></div>
                               </div>
                                <Separator />
                                <div className="space-y-2">
                                     <h4 className="font-semibold flex items-center gap-2"><ShoppingBag className="h-4 w-4"/> Items</h4>
                                     <div className="space-y-1 text-sm text-muted-foreground max-h-24 overflow-y-auto">
                                        {items.map((item, index) => (
                                            <div key={index} className="flex justify-between p-1 rounded-md">
                                                <span>{item.name}</span>
                                                <span className="font-mono">{item.quantity} {item.unit}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <Separator />
                                {order.milestones.find(m=>m.id === 4)?.completed && (
                                     <Alert className="mt-4" variant="default">
                                        <CheckCircle className="h-4 w-4" />
                                        <AlertTitle>Success!</AlertTitle>
                                        <AlertDescription>
                                            This order's production is complete.
                                        </AlertDescription>
                                    </Alert>
                                )}
                           </div>
                       )}
                       {!loading && !order && (
                           <div className="text-center text-muted-foreground py-10">
                               <p>No order loaded.</p>
                           </div>
                       )}
                    </CardContent>
                </Card>
            </div>
        </div>
        <ScanResultPopup result={scanResult} isOpen={isPopupOpen} onOpenChange={setIsPopupOpen} />
        </>
    );
}


export default function PmsScanPage() {
    return (
        <Suspense fallback={<p>Loading...</p>}>
            <PmsScanner />
        </Suspense>
    )
}
