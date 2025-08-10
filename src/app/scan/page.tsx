
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
import { completePmsProcess } from '@/ai/flows/complete-pms-process';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Order, PurchaseRequest } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
    
    const [manualId, setManualId] = useState('');
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(false);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const isScanningRef = useRef(false);

    const getItemsForOrder = async (order: Order | null) => {
        if (!order) return [];
        try {
            const prRef = doc(db, 'purchaseRequests', order.crmOrderNo);
            const prSnap = await getDoc(prRef);
            if (prSnap.exists()) {
                const prData = prSnap.data() as PurchaseRequest;
                const fabricItems = (prData.fabricDetails || []).map(f => ({ name: f.fabricName, quantity: f.quantity, unit: 'Mtr' }));
                const furnitureItems = (prData.furnitureDetails || []).map(f => ({ name: f.furnitureName, quantity: f.quantity, unit: 'Qty' }));
                return [...fabricItems, ...furnitureItems];
            }
        } catch (error) {
            console.error("Error fetching items for order:", error);
        }
        return [];
    }

    const [items, setItems] = useState<{name: string, quantity: string, unit: string}[]>([]);


    const processScan = async (id: string) => {
        if (!id || loading || isScanningRef.current) return;

        isScanningRef.current = true;
        setLoading(true);
        setOrder(null);
        setItems([]);
        
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
                 const fetchedOrder = result.order as Order;
                 setOrder(fetchedOrder);
                 const fetchedItems = await getItemsForOrder(fetchedOrder);
                 setItems(fetchedItems);
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
        const scanner = new Html5QrcodeScanner(
            'reader', 
            { 
                qrbox: { width: 250, height: 250 },
                fps: 10,
            }, 
            false
        );

        function onScanSuccess(decodedText: string, decodedResult: any) {
            scanner.clear();
            setManualId(decodedText);
            processScan(decodedText);
        }

        function onScanFailure(error: any) {
            // handle scan failure, usually better to ignore and keep scanning.
        }

        scanner.render(onScanSuccess, onScanFailure);

        return () => {
            scanner.clear().catch(error => {
                console.error("Failed to clear html5-qrcode-scanner.", error);
            });
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        processScan(manualId);
    };

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
                        <div id="reader" className="w-full"></div>
                         <form onSubmit={handleManualSubmit} className="space-y-2 mt-4">
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
