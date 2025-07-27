
"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Order, PmsStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Camera, CheckCircle, Loader2, ScanLine, Home } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { completePmsProcess } from '@/ai/flows/complete-pms-process';
import { BrowserMultiFormatReader, NotFoundException, DecodeHintType } from '@zxing/library';

function PmsScanner() {
    const router = useRouter();
    const { toast } = useToast();
    const videoRef = useRef<HTMLVideoElement>(null);
    const codeReader = useRef(new BrowserMultiFormatReader());

    const [scannedId, setScannedId] = useState('');
    const [manualId, setManualId] = useState('');
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const isScanningRef = useRef(false);

    const processScan = async (id: string) => {
        if (!id || loading) return;

        setLoading(true);
        setOrder(null);
        
        try {
            const result = await completePmsProcess({ orderId: id });

            if (!result.success) {
                toast({ variant: 'destructive', title: 'Scan Failed', description: result.message, duration: 5000 });
            } else {
                 toast({ title: 'Success!', description: result.message });
            }

            const ordersRef = collection(db, 'orders');
            const q = query(ordersRef, where('crmOrderNo', '==', id));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const orderDoc = querySnapshot.docs[0];
                setOrder({ id: orderDoc.id, ...orderDoc.data() } as Order);
            } else {
                 setOrder(null);
            }

        } catch (error) {
             toast({
                variant: "destructive",
                title: "Scan Error",
                description: "An unexpected error occurred during the scan.",
            });
            console.error("Error during scan process:", error);
        } finally {
            setLoading(false);
            // Allow scanning again
            setTimeout(() => {
                isScanningRef.current = false;
                startDecoding();
            }, 3000); // 3-second cooldown
        }
    };
    
    const startDecoding = () => {
        if (videoRef.current && !isScanningRef.current && hasCameraPermission) {
            isScanningRef.current = true;
            codeReader.current.decodeFromVideoElement(videoRef.current)
                .then(result => {
                    const scannedText = result.getText();
                    setScannedId(scannedText);
                    setManualId(scannedText);
                    processScan(scannedText);
                })
                .catch(err => {
                    isScanningRef.current = false;
                    if (!(err instanceof NotFoundException)) {
                        console.error('Barcode decoding error:', err);
                    }
                    // If not found, try again after a short delay
                    setTimeout(() => startDecoding(), 100);
                });
        }
    };

    useEffect(() => {
        const getCameraPermission = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                setHasCameraPermission(true);
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    // Start scanning once video is playing
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play();
                        startDecoding();
                    };
                }
            } catch (error) {
                console.error('Error accessing camera:', error);
                setHasCameraPermission(false);
                toast({
                    variant: 'destructive',
                    title: 'Camera Access Denied',
                    description: 'Please enable camera permissions in your browser settings to use the scanner.',
                    duration: 5000,
                });
            }
        };
        getCameraPermission();
        
        return () => {
             if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
            codeReader.current.reset();
        };
    }, [toast]);
    
    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        processScan(manualId);
    };

    return (
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
                           {order ? `Details for order ${order.id}` : 'Scan an order to see details here.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                       {loading && <Skeleton className="h-40 w-full" />}
                       {!loading && order && (
                           <div className="space-y-3">
                               <div>
                                   <p className="text-sm text-muted-foreground">Customer</p>
                                   <p className="font-medium">{order.customerName}</p>
                               </div>
                               <div>
                                   <p className="text-sm text-muted-foreground">Status</p>
                                   <p className="font-medium">{order.milestones.find(m=>m.id === 4)?.completed ? 'Stitching Done' : 'Pending Completion'}</p>
                               </div>
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
    );
}


export default function PmsScanPage() {
    return (
        <Suspense fallback={<p>Loading...</p>}>
            <PmsScanner />
        </Suspense>
    )
}
